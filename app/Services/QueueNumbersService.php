<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Sequential ticket numbering (port of app/queue_numbers.php): one shared daily
 * counter per department (Manila day); prefixes reflect category (R/P/E, or
 * AR/AP/AE for ABTC). Random 4-char return codes are kept alongside for
 * return-visit lookups.
 */
class QueueNumbersService
{
    /** Manila day expression used for the daily_counters key (server TZ is UTC). */
    public const MANILA_DAY = "CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+08:00') AS DATE)";

    /**
     * Prefix pair for a department: ABTC departments use AR/AP/AE, all others
     * R/P/E.
     *
     * @return array{0: string, 1: string, 2: string} regular, priority, emergency
     */
    public function queuePrefixes(int $departmentId): array
    {
        $name = (string) DB::table('departments')->where('id', $departmentId)->value('name') ?? '';

        return stripos($name, 'abtc') !== false ? ['AR', 'AP', 'AE'] : ['R', 'P', 'E'];
    }

    /**
     * Atomically take the next sequence value for a department's Manila day.
     * Uses UPDLOCK+HOLDLOCK so concurrent ticket takes can never duplicate.
     */
    public function nextDailySequence(int $departmentId): int
    {
        return DB::transaction(function () use ($departmentId) {
            $row = DB::selectOne(
                'SELECT last_number FROM daily_counters WITH (UPDLOCK, HOLDLOCK)
                 WHERE department_id = ? AND day = '.self::MANILA_DAY,
                [$departmentId]
            );

            if ($row) {
                $next = (int) $row->last_number + 1;
                DB::update(
                    'UPDATE daily_counters SET last_number = ?
                     WHERE department_id = ? AND day = '.self::MANILA_DAY,
                    [$next, $departmentId]
                );

                return $next;
            }

            DB::insert(
                'INSERT INTO daily_counters (department_id, day, last_number)
                 VALUES (?, '.self::MANILA_DAY.', ?)',
                [$departmentId, 1]
            );

            return 1;
        });
    }

    /** Unique 4-char return code (checked against queue.return_code). */
    public function generateReturnCode(): string
    {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for ($attempt = 0; $attempt < 50; $attempt++) {
            $code = '';
            for ($i = 0; $i < 4; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
            $taken = DB::table('queue')->where('return_code', $code)->exists();
            if (! $taken) {
                return $code;
            }
        }

        throw new \RuntimeException('Could not generate unique return code.');
    }

    /**
     * Issue the next visible ticket number + return code for a department/category.
     *
     * @return array{0: string, 1: string} e.g. ['R-001', 'X7K2'] or ['E-001', 'X7K2']
     */
    public function issueTicketNumbers(int $departmentId, string $category): array
    {
        $category = in_array($category, ['priority', 'emergency'], true) ? $category : 'regular';
        [$reg, $pri, $emer] = $this->queuePrefixes($departmentId);
        $prefix = $reg;
        if ($category === 'priority') {
            $prefix = $pri;
        }
        if ($category === 'emergency') {
            $prefix = $emer;
        }
        $seq = $this->nextDailySequence($departmentId);
        $number = $prefix.'-'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
        $code = $this->generateReturnCode();

        return [$number, $code];
    }

    /**
     * Ticket tier from the queue-number prefix: the last letter of the code
     * prefix (E/P/R, or AE/AP/AR). Returns 'e', 'p', or 'r'.
     */
    public function tierForNumber(string $queueNumber): string
    {
        if (preg_match('/^([A-Z]+)-\d+$/', $queueNumber, $m) === 1) {
            return strtolower(substr($m[1], -1));
        }

        return 'r';
    }
}

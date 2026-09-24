import Alpine from 'alpinejs';
import persist from '@alpinejs/persist';
import collapse from '@alpinejs/collapse';

Alpine.plugin(persist);
Alpine.plugin(collapse);

window.Alpine = Alpine;
Alpine.start();
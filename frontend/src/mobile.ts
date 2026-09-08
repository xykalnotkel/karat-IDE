import { isTauri } from './transport';

/** True when running inside the Android (or iOS) app WebView. */
export const isMobile: boolean =
  isTauri && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

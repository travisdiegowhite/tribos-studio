/**
 * Utility to detect if the app is running in an in-app browser/webview
 * Google OAuth blocks these with "disallowed_useragent" error (403)
 */

/**
 * Check if the current browser is an in-app webview that Google will block
 * @returns {object} { isWebview: boolean, appName: string | null }
 */
export function detectWebview() {
  const ua = navigator.userAgent || navigator.vendor || '';

  // Common in-app browser patterns that Google blocks
  const webviewPatterns = [
    { pattern: /FBAN|FBAV|FB_IAB/i, name: 'Facebook' },
    { pattern: /Instagram/i, name: 'Instagram' },
    { pattern: /LinkedInApp/i, name: 'LinkedIn' },
    { pattern: /Twitter/i, name: 'Twitter/X' },
    { pattern: /Snapchat/i, name: 'Snapchat' },
    { pattern: /BytedanceWebview|TikTok/i, name: 'TikTok' },
    { pattern: /Pinterest/i, name: 'Pinterest' },
    { pattern: /Line\//i, name: 'LINE' },
    { pattern: /MicroMessenger/i, name: 'WeChat' },
    { pattern: /WhatsApp/i, name: 'WhatsApp' },
    { pattern: /Telegram/i, name: 'Telegram' },
    { pattern: /Discord/i, name: 'Discord' },
    { pattern: /Slack/i, name: 'Slack' },
    // Generic Android WebView detection
    { pattern: /; wv\)/i, name: 'App' },
    { pattern: /WebView/i, name: 'App' },
  ];

  for (const { pattern, name } of webviewPatterns) {
    if (pattern.test(ua)) {
      return { isWebview: true, appName: name };
    }
  }

  // iOS webview detection: has Mobile/ but no Safari/
  // This catches WKWebView and UIWebView
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) {
    return { isWebview: true, appName: 'App' };
  }

  return { isWebview: false, appName: null };
}

/**
 * Get instructions for opening in a real browser
 * @param {string} appName - Name of the app (e.g., "Instagram")
 * @returns {string} Instructions for the user
 */
export function getWebviewInstructions(appName) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  const browserName = isIOS ? 'Safari' : isAndroid ? 'Chrome' : 'your browser';

  return `To sign in with Google, please open this page in ${browserName}. ` +
    `Tap the menu (usually "..." or share icon) and select "Open in ${browserName}"`;
}

/**
 * Attempt to open the current URL in system browser
 * Note: This may not work in all webviews
 */
export function openInSystemBrowser() {
  const currentUrl = window.location.href;

  // Try different methods to escape the webview
  // Method 1: Use intent URL (Android)
  if (/Android/.test(navigator.userAgent)) {
    window.location.href = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
    return;
  }

  // Method 2: For iOS, we can only suggest copying the URL
  // as there's no reliable way to escape the webview

  // Method 3: Window.open with _system target (works in some webviews)
  window.open(currentUrl, '_system');
}

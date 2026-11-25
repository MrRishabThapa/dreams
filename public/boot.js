// Applies the saved theme before first paint (separate file to satisfy the CSP).
try {
  var t = localStorage.getItem('dreams.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  if (localStorage.getItem('dreams.hide') === '1') document.documentElement.setAttribute('data-hide-balances', 'true');
} catch (e) {}

(() => {
  const isExtension = (value) =>
    typeof value === "string" &&
    (value.includes("chrome-extension://") || value.includes("moz-extension://"));
  const suppress = (event) => {
    const stack = event.error && event.error.stack ? event.error.stack : "";
    const reason = event.reason ? (event.reason.stack || String(event.reason)) : "";
    if (!isExtension(event.filename || "") && !isExtension(stack) && !isExtension(reason)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  window.addEventListener("error", suppress, true);
  window.addEventListener("unhandledrejection", suppress, true);
})();

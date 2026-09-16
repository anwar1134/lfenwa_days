/* ============================================================
   CAPACITOR BRIDGE — Android-only, additive, non-invasive.
   ============================================================
   The journal (bundle.js) exports backups/CSV the standard web way:
   build a Blob, make an <a href="blob:..." download="name">, click it.
   That works in every real browser and in Electron (Chromium shows a
   native Save dialog for it automatically). It does NOT work inside an
   Android WebView: WebViews don't have a download manager wired up to
   arbitrary blob: URLs, so the click silently does nothing.

   Rather than touch the journal's own code (bundle.js / trading-journal.jsx)
   to special-case Android — which would mean maintaining two versions of
   the tested app — this file sits *outside* the app and intercepts the
   click at the DOM level, purely additive:

     1. Not running under Capacitor at all (desktop browser, Electron,
        plain PWA)              -> this whole file is a no-op, returns
                                    immediately, zero behavior change.
     2. Running under Capacitor but on the web target (`cap serve`)
                                 -> also a no-op (isNativePlatform() is
                                    false), same as case 1.
     3. Running under Capacitor on an actual Android device/emulator
                                 -> intercepts the download, writes the
                                    file via @capacitor/filesystem, then
                                    opens the native share sheet via
                                    @capacitor/share so the user can save
                                    it to Drive, send it by email, etc.

   Requires (added to mobile/package.json, wired in automatically by
   `npx cap sync`):
     @capacitor/filesystem
     @capacitor/share
   ============================================================ */
(function () {
  "use strict";

  if (typeof window === "undefined" || !window.Capacitor) return;
  if (typeof window.Capacitor.isNativePlatform !== "function" || !window.Capacitor.isNativePlatform()) return;

  var Plugins = window.Capacitor.Plugins || {};
  var Filesystem = Plugins.Filesystem;
  var Share = Plugins.Share;
  if (!Filesystem) return; // plugin not installed/synced yet — fail silent, app still fully usable

  function toast(message, isError) {
    try {
      var el = document.createElement("div");
      el.textContent = message;
      el.style.cssText =
        "position:fixed;left:16px;right:16px;bottom:24px;z-index:99999;" +
        "background:" + (isError ? "#4C332F" : "#1B252A") + ";" +
        "color:#E7ECEC;border:1px solid " + (isError ? "#C06A5C" : "#263237") + ";" +
        "border-radius:10px;padding:12px 14px;font:13px ui-sans-serif,system-ui,sans-serif;" +
        "box-shadow:0 6px 20px rgba(0,0,0,.35);";
      document.body.appendChild(el);
      setTimeout(function () {
        el.style.transition = "opacity .4s";
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); }, 400);
      }, 3200);
    } catch (e) { /* never let feedback UI break the actual save */ }
  }

  function blobUrlToBase64(blobUrl) {
    return fetch(blobUrl)
      .then(function (res) { return res.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            // reader.result is "data:<mime>;base64,<data>" — Filesystem wants the raw base64 part
            var result = String(reader.result || "");
            var comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = function () { reject(reader.error || new Error("read failed")); };
          reader.readAsDataURL(blob);
        });
      });
  }

  async function handleDownload(anchor) {
    var href = anchor.getAttribute("href") || "";
    var filename = anchor.getAttribute("download") || "export.json";
    if (href.indexOf("blob:") !== 0) return false; // not one of ours — let the platform handle it normally

    try {
      var base64 = await blobUrlToBase64(href);
      var write = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: "DOCUMENTS", // @capacitor/filesystem Directory.Documents
        recursive: true,
      });
      toast("Saved " + filename + " to Documents. Opening share sheet…", false);
      if (Share && write && write.uri) {
        try {
          await Share.share({ title: filename, url: write.uri, dialogTitle: "Save or send " + filename });
        } catch (shareErr) {
          // User cancelled the share sheet, or share isn't available — the file is already
          // safely on disk in Documents, so this is not an error worth surfacing loudly.
        }
      }
      return true;
    } catch (err) {
      toast("Couldn't save " + filename + ": " + (err && err.message ? err.message : "unknown error"), true);
      return true; // we still consumed the click — don't let the WebView also try (and fail silently)
    }
  }

  document.addEventListener(
    "click",
    function (event) {
      var anchor = event.target && event.target.closest ? event.target.closest("a[download]") : null;
      if (!anchor) return;
      var href = anchor.getAttribute("href") || "";
      if (href.indexOf("blob:") !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      handleDownload(anchor);
    },
    true // capture phase — run before the app's own click handler finishes the default action
  );
})();

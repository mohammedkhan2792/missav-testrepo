(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const logBox = $("log");
  const status = $("status");

  function log(message, kind = "") {
    const row = document.createElement("div");
    row.className = "log-line" + (kind ? " " + kind : "");
    row.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
    logBox.appendChild(row);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  window.addEventListener("error", (event) => {
    const message = event.message || "Unknown JavaScript error";
    log("JavaScript error: " + message, "error");
    setStatus("JavaScript error: " + message, "error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    log("Unhandled promise error: " + message, "error");
    setStatus("Unhandled JavaScript error: " + message, "error");
  });

  function validatePageUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only HTTP(S) page URLs are supported.");
    }
    return url;
  }

  function addCandidate(set, value, baseUrl) {
    if (!value) return;
    let cleaned = String(value)
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .trim();

    try {
      const url = new URL(cleaned, baseUrl).href;
      if (/\.m3u8(?:$|[?#])/i.test(url)) set.add(url);
    } catch (_) {}
  }

  async function inspectPage() {
    const input = $("pageUrl").value.trim();

    if (!input) {
      setStatus("Paste a video page URL first.", "error");
      log("Inspect skipped: page URL is empty.", "error");
      return;
    }

    let pageUrl;
    try {
      pageUrl = validatePageUrl(input);
    } catch (error) {
      setStatus(error.message || "Invalid page URL.", "error");
      log(error.message || "Invalid page URL.", "error");
      return;
    }

    setStatus("Inspecting page…");
    $("corsStatus").textContent = "Testing…";
    log("Inspect button clicked.");
    log("Fetching page HTML: " + pageUrl.href);

    try {
      const response = await fetch(pageUrl.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store"
      });

      $("corsStatus").textContent = response.ok ? "Allowed" : "HTTP " + response.status;

      if (!response.ok) throw new Error("HTTP " + response.status);

      const html = await response.text();
      if (!html.trim()) throw new Error("The page returned an empty response.");

      const candidates = new Set();
      const doc = new DOMParser().parseFromString(html, "text/html");

      doc.querySelectorAll("[src],[href],[content],[data-src],[data-url],[data-file],[data-stream],[data-playlist]").forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          if (/^(src|href|content|data-src|data-url|data-file|data-stream|data-playlist)$/i.test(attribute.name)) {
            addCandidate(candidates, attribute.value, pageUrl.href);
          }
        });
      });

      const absolute = html.match(/https?:\/\/[^\s"'<>]+\.m3u8(?:[?#][^\s"'<>]*)?/gi) || [];
      absolute.forEach((url) => addCandidate(candidates, url, pageUrl.href));

      const protocolRelative = html.match(/\/\/[^\s"'<>]+\.m3u8(?:[?#][^\s"'<>]*)?/gi) || [];
      protocolRelative.forEach((url) => addCandidate(candidates, "https:" + url, pageUrl.href));

      const list = Array.from(candidates);
      $("variantCount").textContent = String(list.length);

      if (!list.length) {
        $("playlistType").textContent = "Not found";
        setStatus("Page loaded, but no openly exposed .m3u8 URL was found.", "error");
        log("No openly exposed .m3u8 reference found in the returned HTML.", "error");
        log("If the site's player creates the URL dynamically or requires protected access, a client-only page inspector cannot retrieve it.", "error");
        return;
      }

      $("playlistType").textContent = list.length === 1 ? "Page-exposed URL" : list.length + " page-exposed URLs";
      $("streamUrl").value = list[0];
      log("Found " + list.length + " playlist reference(s).", "ok");
      list.slice(0, 10).forEach((url, i) => log("Playlist " + (i + 1) + ": " + url));

      await diagnose(list[0]);
    } catch (error) {
      $("corsStatus").textContent = "Blocked / failed";
      $("playlistType").textContent = "Unknown";
      $("variantCount").textContent = "—";
      setStatus("Page inspection failed: " + (error.message || "network/CORS error"), "error");
      log("Page inspection failed: " + (error.message || "network/CORS error"), "error");
      log("This usually means the target page does not allow cross-origin HTML reads from GitHub Pages.", "error");
    }
  }

  async function diagnose(raw) {
    const value = String(raw || "").trim();
    if (!value) {
      setStatus("Paste an HLS playlist URL first.", "error");
      log("Diagnostics skipped: playlist URL is empty.", "error");
      return;
    }

    let url;
    try {
      url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are supported.");
    } catch (error) {
      setStatus(error.message || "Invalid playlist URL.", "error");
      log(error.message || "Invalid playlist URL.", "error");
      return;
    }

    setStatus("Fetching playlist for diagnostics…");
    $("corsStatus").textContent = "Testing…";
    log("Diagnosing playlist: " + url.href);

    try {
      const response = await fetch(url.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store"
      });

      $("corsStatus").textContent = response.ok ? "Allowed" : "HTTP " + response.status;
      if (!response.ok) throw new Error("HTTP " + response.status);

      const text = await response.text();
      if (!text.trimStart().startsWith("#EXTM3U")) throw new Error("Response is not an HLS playlist (#EXTM3U missing).");

      const master = /#EXT-X-STREAM-INF:/i.test(text);
      const variants = Array.from(text.matchAll(/#EXT-X-STREAM-INF:([^\n\r]*)[\n\r]+([^\n\r]+)/gi));

      $("playlistType").textContent = master ? "Master / adaptive" : "Media playlist";
      $("variantCount").textContent = master ? String(variants.length) : "1";
      setStatus("Playlist diagnostics complete.", "success");
      log("Playlist fetched successfully.", "ok");

      if (variants.length) {
        log("Variants: " + variants.map((match) => {
          const attrs = match[1];
          const resolution = attrs.match(/RESOLUTION=\d+x(\d+)/i);
          const bandwidth = attrs.match(/(?:AVERAGE-BANDWIDTH|BANDWIDTH)=(\d+)/i);
          if (resolution) return resolution[1] + "p";
          if (bandwidth) return Math.round(Number(bandwidth[1]) / 1000) + " kbps";
          return "variant";
        }).join(", "), "ok");
      }
    } catch (error) {
      $("corsStatus").textContent = "Blocked / failed";
      $("playlistType").textContent = "Unknown";
      $("variantCount").textContent = "—";
      setStatus("Diagnostics failed: " + (error.message || "network/CORS error"), "error");
      log("Diagnostic failure: " + (error.message || "network/CORS error"), "error");
    }
  }

  function teardown() {
    if (window.__streamdeskHls) {
      window.__streamdeskHls.destroy();
      window.__streamdeskHls = null;
    }
    const video = $("video");
    video.pause();
    video.removeAttribute("src");
    video.load();
    $("engine").textContent = "Not started";
    $("resolution").textContent = "—";
    $("duration").textContent = "—";
    $("buffered").textContent = "—";
    $("quality").textContent = "Auto";
    $("qualitySelect").innerHTML = '<option value="-1">Auto</option>';
    $("qualitySelect").disabled = true;
    $("downloadBtn").disabled = true;
  }

  function playStream() {
    const raw = $("streamUrl").value.trim();
    let url;

    try {
      url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are supported.");
    } catch (error) {
      setStatus(error.message || "Invalid stream URL.", "error");
      log(error.message || "Invalid stream URL.", "error");
      return;
    }

    teardown();
    $("emptyState").style.display = "none";
    $("engine").textContent = "Starting";
    $("downloadBtn").disabled = false;
    log("Opening stream: " + url.href);

    const video = $("video");

    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
      window.__streamdeskHls = hls;
      $("engine").textContent = "hls.js";

      hls.on(Hls.Events.MEDIA_ATTACHED, () => log("Media element attached.", "ok"));
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = data.levels || [];
        const select = $("qualitySelect");
        select.innerHTML = '<option value="-1">Auto</option>';

        levels.forEach((level, index) => {
          const option = document.createElement("option");
          option.value = String(index);
          option.textContent = level.height ? level.height + "p" : Math.round((level.bitrate || 0) / 1000) + " kbps";
          select.appendChild(option);
        });

        select.disabled = levels.length === 0;
        log("Manifest parsed; " + levels.length + " quality level(s) found.", "ok");
        setStatus("Playlist loaded. Press Play if needed.", "success");
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        const detail = (data.type || "unknown") + " / " + (data.details || "no details") + (data.response && data.response.code ? " (HTTP " + data.response.code + ")" : "");
        log("HLS error: " + detail + (data.fatal ? " [fatal]" : ""), data.fatal ? "error" : "");
        if (data.fatal) setStatus("Playback failed: " + detail, "error");
      });

      hls.loadSource(url.href);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      $("engine").textContent = "Native HLS";
      video.src = url.href;
      setStatus("Playlist assigned to native HLS.", "success");
    } else {
      $("engine").textContent = "Unsupported";
      setStatus("This browser does not support HLS playback.", "error");
      log("No compatible HLS playback engine found.", "error");
    }
  }

  $("inspectBtn").addEventListener("click", (event) => {
    event.preventDefault();
    inspectPage();
  });

  $("pageUrl").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      inspectPage();
    }
  });

  $("diagnoseBtn").addEventListener("click", () => diagnose($("streamUrl").value));
  $("playForm").addEventListener("submit", (event) => {
    event.preventDefault();
    playStream();
  });

  $("stopBtn").addEventListener("click", () => {
    teardown();
    $("emptyState").style.display = "";
    setStatus("Playback stopped.");
    log("Playback stopped.");
  });

  $("clearBtn").addEventListener("click", () => {
    logBox.replaceChildren();
    log("Log cleared.");
  });

  $("qualitySelect").addEventListener("change", (event) => {
    const hls = window.__streamdeskHls;
    if (!hls) return;
    hls.currentLevel = Number(event.target.value);
  });

  $("downloadBtn").addEventListener("click", async () => {
    const url = $("streamUrl").value.trim();
    if (!url) return;

    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const text = await response.text();
      if (!text.trimStart().startsWith("#EXTM3U")) throw new Error("Response is not an HLS playlist.");
      const blobUrl = URL.createObjectURL(new Blob([text], { type: "application/vnd.apple.mpegurl" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "playlist.m3u8";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setStatus("Playlist downloaded.", "success");
      log("Playlist text downloaded.", "ok");
    } catch (error) {
      setStatus("Download failed: " + (error.message || "network/CORS error"), "error");
      log("Download failed: " + (error.message || "network/CORS error"), "error");
    }
  });

  $("video").addEventListener("loadedmetadata", () => {
    const video = $("video");
    if (Number.isFinite(video.duration)) $("duration").textContent = Math.round(video.duration) + "s";
    if (video.videoWidth && video.videoHeight) $("resolution").textContent = video.videoWidth + " × " + video.videoHeight;
  });

  $("video").addEventListener("timeupdate", () => {
    const video = $("video");
    const seconds = Math.floor(video.currentTime || 0);
    $("currentTime").textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  });

  $("video").addEventListener("playing", () => {
    setStatus("Playing.", "success");
    log("Playback started.", "ok");
  });

  $("video").addEventListener("waiting", () => setStatus("Buffering…"));

  $("video").addEventListener("error", () => {
    setStatus("Video element reported a media error.", "error");
    log("Video element reported a media error.", "error");
  });

  $("jsStatus").textContent = "JavaScript OK";
  $("jsStatus").dataset.kind = "success";
  log("StreamDesk initialized successfully.", "ok");
})();

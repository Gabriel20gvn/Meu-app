import './youtube.css';

// The official player handles streaming and playback controls. No audio is
// downloaded by the app, and no API key or backend is required.
export function createYoutubePlayer(videoId, { autoplay = true } = {}) {
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new TypeError('Identificador de vídeo do YouTube inválido.');
  }

  const url = new URL('https://www.youtube.com/embed/' + videoId);
  url.searchParams.set('autoplay', autoplay ? '1' : '0');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('enablejsapi', '1');
  if (location.protocol === 'https:' || location.protocol === 'http:') url.searchParams.set('origin', location.origin);

  const iframe = document.createElement('iframe');
  iframe.className = 'youtube-frame';
  iframe.title = 'Reprodutor de vídeo do YouTube';
  // YouTube needs an identifying HTTP Referer. Do not use no-referrer here.
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.src = url.href;
  return iframe;
}

let apiPromise;
export function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return apiPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer); script.remove(); apiPromise = null;
      reject(new Error('Não foi possível conectar a partitura ao vídeo. Reabra a música para tentar novamente.'));
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer); previous?.(); resolve(window.YT);
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.append(script);
  });
}

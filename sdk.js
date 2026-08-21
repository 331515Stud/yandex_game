(function () {
  'use strict';

  // Local-development stub of the YaGames SDK.
  // Idempotent: if a real YaGames SDK is already present, this does nothing.
  // Never blocks the game when the SDK is absent.
  if (window.YaGames) return;

  function noop() {}

  var fakeAdv = {
    showFullscreenAdv: function () {
      return Promise.resolve({ state: 'opened', status: 'opened' });
    },
    showRewardedVideo: function (opts) {
      opts = opts || {};
      if (opts.callbacks && typeof opts.callbacks.onRewarded === 'function') {
        opts.callbacks.onRewarded();
      }
      if (opts.callbacks && typeof opts.callbacks.onClose === 'function') {
        opts.callbacks.onClose();
      }
      return Promise.resolve({ state: 'rewarded', status: 'rewarded' });
    },
    showBannerAdv: function () { return Promise.resolve(); },
    hideBannerAdv: function () { return Promise.resolve(); },
    getBannerAdvStatus: function () { return Promise.resolve({ status: 'on', stickyStatus: 'on' }); },
    on: function () { return noop; }
  };

  var fakeGameplay = {
    start: noop,
    stop: noop
  };

  var fakeLoading = {
    ready: noop,
    error: noop
  };

  var fakePlayer = {
    getData: function () { return Promise.resolve({}); },
    setData: function () { return Promise.resolve({}); },
    get: function () { return Promise.resolve(undefined); },
    set: function () { return Promise.resolve(); },
    getStats: function () { return Promise.resolve({}); },
    setStats: function () { return Promise.resolve({}); }
  };

  var fakeYsdk = {
    features: {
      Adv: fakeAdv,
      GameplayAPI: fakeGameplay,
      LoadingAPI: fakeLoading
    },
    Adv: fakeAdv,
    GameplayAPI: fakeGameplay,
    LoadingAPI: fakeLoading,
    getPlayer: function () { return Promise.resolve(fakePlayer); },
    environment: { i18n: { lang: 'ru' }, app: { id: 'local' } },
    deviceInfo: { type: 'desktop', isMobile: false },
    isAvailableMethod: function () { return true; }
  };

  window.YaGames = {
    _stub: true,
    init: function () {
      return Promise.resolve(fakeYsdk);
    }
  };
})();
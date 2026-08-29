(function () {
  var PAGE_W = 1191;
  var PAGE_H = 842;
  var MAX_ZOOM = 3;

  var reflowApplied  = false;
  var originalRightItems = null;
  var _mobileHiddenForOverride = null;
  var currentBottomSection = null;
  var textSectionHeight  = 0;
  var mediaSectionHeight = PAGE_H;
  var mobileScreen = 0;

  var origContainerTransform        = null;
  var origContainerWebkitTransform  = null;
  var origContainerMsTransform      = null;
  var origContainerOverflow         = null;

  function screenH() {
    if (!reflowApplied) return PAGE_H;
    return mobileScreen === 0 ? textSectionHeight : mediaSectionHeight;
  }
  function totalScale()  { return bs * zoom; }
  function isMobilePortrait() {
    return window.innerWidth < window.innerHeight && window.innerWidth < 600;
  }

  function clampPan() {
    var ts = totalScale();
    var cw = PAGE_W * ts, ch = screenH() * ts;
    var vw = window.innerWidth,  vh = window.innerHeight;
    px = (cw <= vw) ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, px));
    if (reflowApplied && mobileScreen === 1) {
      py = (ch <= vh) ? 0 : Math.min(0, Math.max(vh - ch, py));
    } else {
      py = (ch <= vh) ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, py));
    }
  }

  function applyTransform(smooth) {
    clampPan();
    var ts = totalScale();
    var t = 'translate(' + px + 'px,' + py + 'px) scale(' + ts + ')';
    document.body.style.transition       = smooth ? 'transform 0.25s ease-out' : 'none';
    document.body.style.transformOrigin  = '0 0';
    document.body.style.webkitTransformOrigin = '0 0';
    document.body.style.transform        = t;
    document.body.style.webkitTransform  = t;
    window.parent.postMessage({ type: 'zoom', value: zoom }, '*');
  }

  function reset() {
    bs = Math.min(window.innerWidth / PAGE_W, window.innerHeight / screenH());
    zoom = 1; px = 0; py = 0;
    applyTransform(false);
  }

  function showScreen(n) {
    if (!reflowApplied) return;
    // Text-only pages have no media section — nothing to switch to.
    if (!currentBottomSection) return;
    mobileScreen = n;
    var container = document.body.firstElementChild;
    if (n === 0) {
      if (container) container.style.display = '';
      if (currentBottomSection) {
        currentBottomSection.style.display = 'none';
        currentBottomSection.style.top = textSectionHeight + 'px';
      }
      document.body.style.height = textSectionHeight + 'px';
    } else {
      if (container) container.style.display = 'none';
      if (currentBottomSection) {
        currentBottomSection.style.display = '';
        currentBottomSection.style.top = '0px';
      }
      document.body.style.height = mediaSectionHeight + 'px';
    }
    zoom = 1; px = 0; py = 0;
    reset();
  }

  var _patchedButtons = [];

  window._responsiveNextPage = function (origActions) {
    // On text screen (screen 0): golden arrow tap reveals the media section —
    // same as swiping up, so the user sees the image before moving on.
    if (reflowApplied && mobileScreen === 0 && currentBottomSection) {
      showScreen(1);
    } else {
      // On media screen, desktop, or no reflow: navigate to the next page.
      try { eval(origActions); } catch(e) {}
    }
  };

  function installButtonIntercepts() {
    var btns = document.querySelectorAll('._idGenButton[data-clickactions]');
    btns.forEach(function (btn) {
      if (btn._responsivePatchedActions) return;
      var orig = btn.getAttribute('data-clickactions');
      // Only intercept page-navigation buttons — never external URL or mailto buttons
      if (!/publication[^'"]*\.html/.test(orig)) return;
      btn._responsivePatchedActions = orig;
      var escaped = orig.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      btn.setAttribute('data-clickactions', "_responsiveNextPage('" + escaped + "')");
      _patchedButtons.push(btn);
    });
  }

  function removeButtonIntercepts() {
    _patchedButtons.forEach(function (btn) {
      if (btn._responsivePatchedActions) {
        btn.setAttribute('data-clickactions', btn._responsivePatchedActions);
        delete btn._responsivePatchedActions;
      }
    });
    _patchedButtons = [];
  }

  function hideAdobeNavButtons() {
    document.querySelectorAll('._idGenButton').forEach(function (btn) {
      var actions = btn._responsivePatchedActions || btn.getAttribute('data-clickactions') || '';
      if (/publication[^'"]*\.html/.test(actions)) {
        btn.style.opacity = '0';
        // Explicitly set pointer-events:auto to override the HTML inline
        // style="pointer-events:none" that InDesign bakes into every nav button.
        // The invisible button acts as the tap hotspot over the visible golden
        // arrow graphic — same mechanism as desktop (enableAdobeNavButtons does
        // the same thing).  Only silence the children: InDesign sometimes
        // generates a position:absolute child img that spans the full page
        // container, which would swallow all taps outside the button area.
        btn.style.pointerEvents = 'auto';
        btn.querySelectorAll('*').forEach(function (child) {
          child.style.pointerEvents = 'none';
        });
        // Silence ALL subsequent siblings — any element that follows the button
        // in the DOM is painted on top (higher z-order within the same stacking
        // context) and can intercept taps meant for the invisible button beneath.
        var sibling = btn.nextElementSibling;
        var pastCta = false;
        while (sibling) {
          // When we hit a CTA button (_idGenButton with external URL/mailto), mark that
          // we're past it so we can continue silencing decorative siblings after it.
          if (sibling.classList.contains('_idGenButton')) {
            var sibActions = sibling.getAttribute('data-clickactions') || '';
            if (/publication[^'"]*\.html/.test(sibActions)) {
              // Another page-nav button — stop here
              break;
            }
            // It's a CTA button (external URL/mailto) — skip silencing it, but continue loop
            pastCta = true;
            sibling = sibling.nextElementSibling;
            continue;
          }
          // Silence decorative/text siblings both before and after the CTA button
          if (sibling.classList.contains('Basic-Text-Frame')) {
            sibling.style.opacity = '0';
          }
          sibling.style.pointerEvents = 'none';
          sibling.querySelectorAll('*').forEach(function (child) {
            child.style.pointerEvents = 'none';
          });
          sibling = sibling.nextElementSibling;
        }
      }
    });
  }

  function enableAdobeNavButtons() {
    // Desktop: keep opacity:0 (invisible) but allow pointer events so the
    // hotspot catches clicks over the visible yellow arrow graphics.
    // Ghost buttons (publication-10.html and beyond) have a position:absolute child img
    // that spans the ENTIRE outer container (because the button itself is position:static,
    // so the img is anchored to the nearest positioned ancestor = the full-page container).
    // pointer-events:none on the button alone is not enough — CSS pointer-events is NOT
    // inherited, so children still have pointer-events:auto by default. Clicks on the
    // full-page img bubble up through the button and fire onMouseDown, triggering
    // goToDestination('publication-10.html') → navigate:10 → loop to page 0 on desktop.
    // Fix: also explicitly set pointer-events:none on every descendant of ghost buttons.
    document.querySelectorAll('._idGenButton').forEach(function (btn) {
      var actions = btn.getAttribute('data-clickactions') || '';
      if (!/publication[^'"]*\.html/.test(actions)) return;
      var m = actions.match(/publication-(\d+)\.html/);
      var pageNum = m ? parseInt(m[1], 10) : 0;
      if (pageNum >= 10) {
        btn.querySelectorAll('*').forEach(function (child) {
          child.style.pointerEvents = 'none';
        });
        return;
      }
      btn.style.pointerEvents = 'auto';
    });
  }

  function findPageNavButton() {
    var btns = document.querySelectorAll('._idGenButton');
    for (var i = 0; i < btns.length; i++) {
      var actions = btns[i]._responsivePatchedActions || btns[i].getAttribute('data-clickactions') || '';
      if (/publication[^'"]*\.html/.test(actions)) return btns[i];
    }
    return null;
  }

  // Proxy goToDestination through the parent shell instead of navigating the iframe directly
  window.goToDestination = function (ref) {
    if (/^https?:\/\/|^mailto:|^tel:/.test(ref)) {
      if (isMobilePortrait()) {
        // iOS Safari blocks window.open() from inside iframe touch handlers regardless
        // of allow="popups". window.top.location.href is a navigation (not a popup)
        // so it is always permitted. User can press Back to return to the mailer.
        window.top.location.href = ref;
      } else {
        // Desktop: use the iframe's own window.open() — explicitly permitted by the
        // allow="popups" attribute on the parent <iframe>. Avoids window.top.open()
        // which desktop popup blockers block when called from inside an iframe.
        var opened = window.open(ref, '_blank', 'noopener,noreferrer');
        if (!opened || opened.closed) {
          // Popup blocked — navigate top frame as fallback (try/catch handles
          // cross-origin local-file scenarios where window.top.location is guarded).
          try { window.top.location.href = ref; } catch (e) { window.location.href = ref; }
        }
      }
      return;
    }
    var m = ref.match(/publication(-\d+)?\.html/);
    if (m) {
      var numMatch = m[1] ? m[1].match(/-(\d+)/) : null;
      var page = numMatch ? parseInt(numMatch[1]) : 0;
      window.parent.postMessage({ type: 'navigate', page: page }, '*');
    }
  };



  function detectRightItems() {
    var container = document.body.firstElementChild;
    if (!container) return [];
    var SPLIT = 585;
    var items  = [];
    Array.from(container.children).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.left >= SPLIT) {
        items.push({
          el: el,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          origTransform:        el.style.transform,
          origWebkitTransform:  el.style.webkitTransform,
          origMsTransform:      el.style.msTransform
        });
      }
    });
    return items;
  }

  function mobileReflow() {
    if (reflowApplied) return;
    if (!originalRightItems || originalRightItems.length === 0) return;

    var container = document.body.firstElementChild;
    if (!container) return;

    origContainerTransform       = container.style.transform;
    origContainerWebkitTransform = container.style.webkitTransform;
    origContainerMsTransform     = container.style.msTransform;
    origContainerOverflow        = container.style.overflow;
    container.style.overflow     = 'visible';

    var videoItems = [], imageItems = [];

    function _hasRealMediaImg(el) {
      var imgs = el.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('src') || '';
        if (src && src.indexOf('data:') !== 0) return true;
      }
      return false;
    }

    originalRightItems.forEach(function (item) {
      if (item.el.querySelector('video'))     videoItems.push(item);
      else if (_hasRealMediaImg(item.el))     imageItems.push(item);
    });
    var hasVideo = videoItems.length > 0;

    // Manual override: some layouts (e.g. a centred circular graphic) place their
    // media element left of the generic SPLIT=585 auto-detect threshold, so it's
    // never picked up as a "right column" item. data-media-selector names it
    // explicitly, mobile-only — desktop never calls mobileReflow(), so the
    // original layout there is untouched.
    if (!hasVideo && imageItems.length === 0) {
      var selector = document.body.getAttribute('data-media-selector');
      var manualEl = selector && container.querySelector(selector);
      if (manualEl) {
        var mr = manualEl.getBoundingClientRect();
        var manualItem = {
          el: manualEl,
          rect: { left: mr.left, top: mr.top, width: mr.width, height: mr.height },
          origTransform:       manualEl.style.transform,
          origWebkitTransform: manualEl.style.webkitTransform,
          origMsTransform:     manualEl.style.msTransform
        };
        imageItems.push(manualItem);
        // Also register it in originalRightItems so revertReflow() (which only
        // walks that array) restores it when switching back to desktop width.
        originalRightItems.push(manualItem);
      }
    }

    if (!hasVideo && imageItems.length === 0) return;

    // Pages with a hand-authored mobile text block (data-mobile-text-override)
    // skip the minX-driven auto-scale (that heuristic assumes text fills
    // exactly up to where the auto-detected media starts, which doesn't hold
    // for a manual override). Instead the block is authored at a narrow native
    // width — like every other page's text column — and measured, then scaled
    // up uniformly to fill PAGE_W, same mechanism as the rest of the deck.
    // That inflates height proportionally into a genuine portrait shape,
    // rather than leaving it at the original landscape PAGE_W×PAGE_H ratio.
    var mobileTextOverrideSel = document.body.getAttribute('data-mobile-text-override');
    var textScale;
    if (mobileTextOverrideSel) {
      var overrideElForMeasure = container.querySelector(mobileTextOverrideSel);
      if (overrideElForMeasure) {
        var prevDisplay = overrideElForMeasure.style.display;
        overrideElForMeasure.style.display = 'block';
        var nativeW = overrideElForMeasure.offsetWidth || PAGE_W;
        var nativeH = overrideElForMeasure.scrollHeight || PAGE_H;
        overrideElForMeasure.style.display = prevDisplay;
        textScale = nativeW > 0 ? PAGE_W / nativeW : 1;
        textSectionHeight = Math.ceil(nativeH * textScale);
      } else {
        textScale = 1;
        textSectionHeight = PAGE_H;
      }
    } else {
      var minXSource = hasVideo ? videoItems : imageItems;
      var minX = Math.min.apply(null, minXSource.map(function (i) { return i.rect.left; }));
      textScale = minX > 0 ? PAGE_W / minX : 1;
      textSectionHeight = Math.ceil(PAGE_H * textScale);
    }

    // Portrait-fill: pages with data-text-portrait-fill="true" upscale the text
    // section so it fills the same proportion of the viewport as the image section.
    if (document.body.getAttribute('data-text-portrait-fill') === 'true') {
      var targetFill = 0.80;
      var heightFill = PAGE_H * textScale * window.innerWidth / (PAGE_W * window.innerHeight);
      if (heightFill < targetFill) {
        textScale = targetFill * window.innerHeight * PAGE_W / (PAGE_H * window.innerWidth);
        textSectionHeight = Math.ceil(PAGE_H * textScale);
      }
    }

    var ct = 'scale(' + textScale + ')';
    container.style.transform             = ct;
    container.style.webkitTransform       = ct;
    container.style.msTransform           = ct;
    container.style.transformOrigin       = '0 0';
    container.style.webkitTransformOrigin = '0 0';

    // Text-only mode: scale for the text content but do NOT create a media section.
    // Right-side items (images/video) are hidden — the page's dedicated media view
    // lives on a separate page (e.g. pub-10 for pub-9's extensions GIF).
    if (document.body.getAttribute('data-text-only') === 'true') {
      videoItems.concat(imageItems).forEach(function (item) {
        item.el.style.display = 'none';
        item._hiddenForTextOnly = true;
      });
      document.body.style.height = textSectionHeight + 'px';
      reflowApplied = true;
      mobileScreen  = 0;
      installButtonIntercepts();
      return;
    }

    mediaSectionHeight = Math.ceil(window.innerHeight * PAGE_W / window.innerWidth);

    var bottomSection = document.createElement('div');
    bottomSection.className = '_responsiveMediaSection';
    bottomSection.style.cssText = [
      'position:absolute',
      'top:' + textSectionHeight + 'px',
      'left:0',
      'width:'  + PAGE_W + 'px',
      'height:' + mediaSectionHeight + 'px',
      'overflow:hidden',
      'background:white',
      'display:none'
    ].join(';') + ';';

    // InDesign multi-state objects (tap-to-toggle video/image state) nest the
    // real media element inside extra nameless divs (e.g. ._idGenCurrentState)
    // that carry their own fixed-pixel width/height + overflow:hidden via
    // id-specific CSS rules. Resizing only the immediate wrapper leaves those
    // ancestors clipping the media to its original tiny box. Walk and resize
    // every DIV between root and the media element, not just the first one.
    function resizeAncestorChain(root, target, w, h) {
      var chain = [];
      var el = target ? target.parentElement : null;
      while (el && el !== root) {
        if (el.tagName === 'DIV') chain.push(el);
        el = el.parentElement;
      }
      chain.forEach(function (node) {
        node._responsiveOrigWidth    = node.style.width;
        node._responsiveOrigHeight   = node.style.height;
        node._responsiveOrigOverflow = node.style.overflow;
        node.style.width     = w + 'px';
        node.style.height    = h + 'px';
        node.style.overflow  = 'hidden';
      });
      return chain;
    }

    if (hasVideo) {
      imageItems.forEach(function (item) {
        item._hiddenForVideo = true;
        item.el.style.display = 'none';
        container.removeChild(item.el);
        bottomSection.appendChild(item.el);
      });

      videoItems.forEach(function (item) {
        var videoEl = item.el.querySelector('video');
        var wrapper = item.el.querySelector('div[class*="_idGenObjectAttribute"]') ||
                      item.el.querySelector('div') || item.el.firstElementChild;
        item._videoEl = videoEl; item._wrapper = wrapper;
        item._ancestorChain = resizeAncestorChain(item.el, videoEl, PAGE_W, mediaSectionHeight);

        item._elOrigWidth      = item.el.style.width;
        item._elOrigHeight     = item.el.style.height;
        item._elOrigOverflow   = item.el.style.overflow;
        item._elOrigBackground = item.el.style.backgroundImage;
        item.el.style.width           = PAGE_W + 'px';
        item.el.style.height          = mediaSectionHeight + 'px';
        item.el.style.overflow        = 'hidden';
        item.el.style.backgroundImage = 'none';

        if (wrapper) {
          item._wrapperOrigWidth    = wrapper.style.width;
          item._wrapperOrigHeight   = wrapper.style.height;
          item._wrapperOrigOverflow = wrapper.style.overflow;
          wrapper.style.width    = PAGE_W + 'px';
          wrapper.style.height   = mediaSectionHeight + 'px';
          wrapper.style.overflow = 'hidden';
        }
        if (videoEl) {
          item._videoOrigWidth     = videoEl.style.width;
          item._videoOrigHeight    = videoEl.style.height;
          item._videoOrigDisplay   = videoEl.style.display;
          item._videoOrigObjectFit = videoEl.style.objectFit;
          item._videoOrigMaxHeight = videoEl.style.maxHeight;
          item._videoOrigMargin    = videoEl.style.margin;
          videoEl.style.display   = 'block';
          videoEl.style.width     = '100%';
          videoEl.style.height    = '100%';
          videoEl.style.objectFit = 'cover';
          videoEl.style.margin    = '0';
        }

        item.el.style.transform             = 'translate(0px,0px)';
        item.el.style.webkitTransform       = 'translate(0px,0px)';
        item.el.style.msTransform           = 'translate(0px,0px)';
        item.el.style.transformOrigin       = '0 0';
        item.el.style.webkitTransformOrigin = '0 0';
        container.removeChild(item.el);
        bottomSection.appendChild(item.el);
      });

    } else {
      imageItems.forEach(function (item) {
        var imgEl   = item.el.querySelector('img');
        var wrapper = item.el.querySelector('div[class*="_idGenObjectAttribute"]') ||
                      item.el.querySelector('div') || item.el.firstElementChild;
        item._imgEl = imgEl; item._wrapper = wrapper;
        item._ancestorChain = resizeAncestorChain(item.el, imgEl, PAGE_W, mediaSectionHeight);

        item._elOrigWidth      = item.el.style.width;
        item._elOrigHeight     = item.el.style.height;
        item._elOrigOverflow   = item.el.style.overflow;
        item._elOrigPosition   = item.el.style.position;
        item._elOrigBackground = item.el.style.backgroundImage;
        item.el.style.position        = 'relative';
        item.el.style.width           = PAGE_W + 'px';
        item.el.style.height          = mediaSectionHeight + 'px';
        item.el.style.overflow        = 'hidden';
        item.el.style.backgroundImage = 'none';

        if (wrapper) {
          item._wrapperOrigWidth    = wrapper.style.width;
          item._wrapperOrigHeight   = wrapper.style.height;
          item._wrapperOrigOverflow = wrapper.style.overflow;
          item._wrapperOrigPosition = wrapper.style.position;
          wrapper.style.position = 'absolute';
          wrapper.style.width    = PAGE_W + 'px';
          wrapper.style.height   = mediaSectionHeight + 'px';
          wrapper.style.overflow = 'hidden';
        }
        if (imgEl) {
          item._imgOrigWidth     = imgEl.style.width;
          item._imgOrigHeight    = imgEl.style.height;
          item._imgOrigDisplay   = imgEl.style.display;
          item._imgOrigObjectFit = imgEl.style.objectFit;
          item._imgOrigPosition  = imgEl.style.position;
          item._imgOrigMaxWidth  = imgEl.style.maxWidth;
          item._imgOrigTransform = imgEl.style.transform;
          imgEl.style.position   = 'absolute';
          imgEl.style.display    = 'block';
          imgEl.style.width      = '100%';
          imgEl.style.height     = '100%';
          imgEl.style.objectFit  = 'contain';
          imgEl.style.maxWidth   = '';
          imgEl.style.transform  = 'none';
        }

        item.el.style.transform             = 'translate(0px,0px)';
        item.el.style.webkitTransform       = 'translate(0px,0px)';
        item.el.style.msTransform           = 'translate(0px,0px)';
        item.el.style.transformOrigin       = '0 0';
        item.el.style.webkitTransformOrigin = '0 0';
        container.removeChild(item.el);
        bottomSection.appendChild(item.el);
      });
    }

    document.body.appendChild(bottomSection);
    document.body.style.height = textSectionHeight + 'px';
    currentBottomSection = bottomSection;
    reflowApplied = true;
    mobileScreen  = 0;
    installButtonIntercepts();

    // Swap in a hand-authored mobile text block: hide the elements tagged
    // ._mobileHideOnReflow (the original per-word-positioned columns, which
    // can't reflow to fill the space freed by pulling the media out) and
    // reveal the override block in their place. Desktop never reaches here.
    if (mobileTextOverrideSel) {
      var overrideEl = container.querySelector(mobileTextOverrideSel);
      if (overrideEl) {
        overrideEl.style.display = 'block';
        _mobileHiddenForOverride = Array.prototype.slice.call(
          container.querySelectorAll('._mobileHideOnReflow')
        );
        _mobileHiddenForOverride.forEach(function (el) {
          el._responsiveOrigDisplay = el.style.display;
          el.style.display = 'none';
        });
      }
    }

    // Media-only pages (no text screen) — jump straight to media screen
    if (document.body.getAttribute('data-media-only') === 'true') {
      showScreen(1);
    }
  }

  function revertReflow() {
    if (!reflowApplied) return;
    var container = document.body.firstElementChild;
    if (!container) return;
    container.style.display = '';

    originalRightItems.forEach(function (item) {
      if (item._videoEl) {
        item._videoEl.style.width      = item._videoOrigWidth     || '';
        item._videoEl.style.height     = item._videoOrigHeight    || '';
        item._videoEl.style.display    = item._videoOrigDisplay   || '';
        item._videoEl.style.objectFit  = item._videoOrigObjectFit || '';
        item._videoEl.style.maxHeight  = item._videoOrigMaxHeight || '';
        item._videoEl.style.margin     = item._videoOrigMargin    || '';
      }
      if (item._imgEl) {
        item._imgEl.style.position  = item._imgOrigPosition  || '';
        item._imgEl.style.width     = item._imgOrigWidth     || '';
        item._imgEl.style.height    = item._imgOrigHeight    || '';
        item._imgEl.style.display   = item._imgOrigDisplay   || '';
        item._imgEl.style.objectFit = item._imgOrigObjectFit || '';
        item._imgEl.style.maxWidth  = item._imgOrigMaxWidth  || '';
        item._imgEl.style.transform = item._imgOrigTransform || '';
      }
      if (item._wrapper) {
        item._wrapper.style.position = item._wrapperOrigPosition || '';
        item._wrapper.style.width    = item._wrapperOrigWidth    || '';
        item._wrapper.style.height   = item._wrapperOrigHeight   || '';
        item._wrapper.style.overflow = item._wrapperOrigOverflow || '';
      }
      if (item._ancestorChain) {
        item._ancestorChain.forEach(function (node) {
          node.style.width     = node._responsiveOrigWidth    || '';
          node.style.height    = node._responsiveOrigHeight   || '';
          node.style.overflow  = node._responsiveOrigOverflow || '';
          delete node._responsiveOrigWidth;
          delete node._responsiveOrigHeight;
          delete node._responsiveOrigOverflow;
        });
        delete item._ancestorChain;
      }
      if (item._videoEl || item._imgEl) {
        item.el.style.position        = item._elOrigPosition   || '';
        item.el.style.width           = item._elOrigWidth      || '';
        item.el.style.height          = item._elOrigHeight     || '';
        item.el.style.overflow        = item._elOrigOverflow   || '';
        item.el.style.backgroundImage = item._elOrigBackground || '';
      }
      if (item._hiddenForVideo) item.el.style.display = '';

      delete item._videoEl; delete item._imgEl; delete item._wrapper;
      delete item._elOrigWidth; delete item._elOrigHeight; delete item._elOrigOverflow;
      delete item._elOrigPosition; delete item._elOrigBackground;
      delete item._wrapperOrigWidth; delete item._wrapperOrigHeight;
      delete item._wrapperOrigOverflow; delete item._wrapperOrigPosition;
      delete item._videoOrigWidth; delete item._videoOrigHeight; delete item._videoOrigDisplay;
      delete item._videoOrigObjectFit; delete item._videoOrigMaxHeight; delete item._videoOrigMargin;
      delete item._imgOrigWidth; delete item._imgOrigHeight; delete item._imgOrigDisplay;
      delete item._imgOrigObjectFit; delete item._imgOrigPosition; delete item._imgOrigMaxWidth;
      delete item._imgOrigTransform; delete item._hiddenForVideo;

      if (item._hiddenForTextOnly) {
        item.el.style.display = '';
        delete item._hiddenForTextOnly;
      }

      item.el.style.transform             = item.origTransform;
      item.el.style.webkitTransform       = item.origWebkitTransform;
      item.el.style.msTransform           = item.origMsTransform;
      item.el.style.transformOrigin       = '';
      item.el.style.webkitTransformOrigin = '';
      container.appendChild(item.el);
    });

    if (currentBottomSection && currentBottomSection.parentNode) {
      currentBottomSection.parentNode.removeChild(currentBottomSection);
    }

    if (_mobileHiddenForOverride) {
      _mobileHiddenForOverride.forEach(function (el) {
        el.style.display = el._responsiveOrigDisplay || '';
        delete el._responsiveOrigDisplay;
      });
      _mobileHiddenForOverride = null;
      var overrideSel = document.body.getAttribute('data-mobile-text-override');
      var overrideEl = overrideSel && container.querySelector(overrideSel);
      if (overrideEl) overrideEl.style.display = 'none';
    }

    container.style.transform             = origContainerTransform;
    container.style.webkitTransform       = origContainerWebkitTransform;
    container.style.msTransform           = origContainerMsTransform;
    container.style.transformOrigin       = '';
    container.style.webkitTransformOrigin = '';
    container.style.overflow              = origContainerOverflow;
    document.body.style.height            = PAGE_H + 'px';

    removeButtonIntercepts();

    currentBottomSection = null;
    textSectionHeight    = 0;
    mediaSectionHeight   = PAGE_H;
    reflowApplied        = false;
    mobileScreen         = 0;
  }

  var bs = 1, zoom = 1, px = 0, py = 0;
  var active = {};
  var t0x = 0, t0y = 0, drag0px = 0, drag0py = 0;
  var pinch0dist = 0, pinch0zoom = 1, pinch0px = 0, pinch0py = 0;
  var moved = false;
  var lastTapTime = 0, lastTapX = 0, lastTapY = 0;

  function touchIds() { return Object.keys(active); }

  document.addEventListener('touchstart', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      active[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    var ids = touchIds();
    if (ids.length === 1) {
      t0x = e.changedTouches[0].clientX; t0y = e.changedTouches[0].clientY;
      drag0px = px; drag0py = py; moved = false;
    } else if (ids.length === 2) {
      var a = active[ids[0]], b = active[ids[1]];
      pinch0dist = Math.hypot(b.x - a.x, b.y - a.y);
      pinch0zoom = zoom; pinch0px = px; pinch0py = py;
    }
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      active[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    var ids = touchIds();
    if (ids.length >= 2) {
      e.preventDefault(); moved = true;
      var a = active[ids[0]], b = active[ids[1]];
      var dist = Math.hypot(b.x - a.x, b.y - a.y);
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var newZoom = Math.min(MAX_ZOOM, Math.max(1, pinch0zoom * dist / pinch0dist));
      px = mx - (mx - pinch0px) * newZoom / pinch0zoom;
      py = my - (my - pinch0py) * newZoom / pinch0zoom;
      zoom = newZoom;
      applyTransform(false);
    } else if (ids.length === 1 && zoom > 1.05) {
      e.preventDefault(); moved = true;
      px = drag0px + (active[ids[0]].x - t0x);
      py = drag0py + (active[ids[0]].y - t0y);
      applyTransform(false);
    }
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    var ended = e.changedTouches[0];
    for (var i = 0; i < e.changedTouches.length; i++) delete active[e.changedTouches[i].identifier];
    if (touchIds().length > 0) return;

    var dx = ended.clientX - t0x, dy = ended.clientY - t0y;
    var dist = Math.hypot(dx, dy), now = Date.now();

    // If the touch landed on a CTA button (_idGenButton with external URL or mailto),
    // skip ALL gesture handling — the button's own onTouchStart already fired the action.
    // This prevents the double-tap zoom from triggering when a user taps the button twice.
    var tapTarget = e.target;
    while (tapTarget && tapTarget !== document.body) {
      if (tapTarget.classList && tapTarget.classList.contains('_idGenButton')) {
        var btnActions = tapTarget.getAttribute('data-clickactions') || '';
        if (/^https?:|^mailto:|^tel:/.test(btnActions.replace(/goToDestination\s*\(\s*['"]/, '').replace(/['"]\s*\).*/, ''))) {
          moved = false;
          return;
        }
      }
      tapTarget = tapTarget.parentElement;
    }

    if (!moved) {
      if (dist < 15) {
        if (now - lastTapTime < 320 && Math.abs(ended.clientX - lastTapX) < 40 && Math.abs(ended.clientY - lastTapY) < 40) {
          if (zoom > 1.5) { zoom = 1; px = 0; py = 0; }
          else {
            var pz = zoom; zoom = 2.5;
            px = ended.clientX - (ended.clientX - px) * zoom / pz;
            py = ended.clientY - (ended.clientY - py) * zoom / pz;
          }
          applyTransform(true); lastTapTime = 0; return;
        }
        lastTapTime = now; lastTapX = ended.clientX; lastTapY = ended.clientY;
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && zoom <= 1.05) {
        if (reflowApplied && mobileScreen === 1 && dx > 0) {
          if (document.body.getAttribute('data-media-only') === 'true') {
            // Media-only page: swipe right goes to previous page in parent, not empty text screen
            window.parent.postMessage({ type: 'swipe', dir: 'right', mobile: isMobilePortrait() }, '*');
          } else {
            showScreen(0);
          }
        } else {
          window.parent.postMessage({ type: 'swipe', dir: dx < 0 ? 'left' : 'right', mobile: isMobilePortrait() }, '*');
        }
      } else if (reflowApplied && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) && zoom <= 1.05) {
        if (mobileScreen === 0 && dy < 0 && currentBottomSection) {
          showScreen(1);
        } else if (mobileScreen === 1 && dy > 0) {
          showScreen(0);
        }
      }
    }
    moved = false;
  }, { passive: true, capture: true });

  var style = document.createElement('style');
  style.textContent = [
    'html, body { background: transparent !important; overflow: hidden !important; margin: 0 !important; }',
    '._responsiveMediaSection * { background-image: none !important; }',
    '._responsiveMediaSection video { display: block !important; width: 100% !important; height: 100% !important; object-fit: cover !important; margin: 0 !important; }',
    '._responsiveMediaSection img { position: absolute !important; display: block !important; width: 100% !important; height: 100% !important; object-fit: contain !important; max-width: none !important; transform: none !important; }'
  ].join('\n');
  document.head.appendChild(style);

  function applyBodyStyles() {
    document.body.style.overflow = 'hidden';
    document.body.style.margin   = '0';
    document.body.style.backgroundColor = 'transparent';
  }

  function initAll() {
    applyBodyStyles();
    if (!originalRightItems) originalRightItems = detectRightItems();
    if (isMobilePortrait()) {
      mobileReflow();
      hideAdobeNavButtons();
    } else {
      enableAdobeNavButtons();
    }
    reset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.addEventListener('load', function () { applyBodyStyles(); reset(); });

  // Receive navigation messages from parent shell
  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'triggerPrev') {
      if (reflowApplied && mobileScreen === 1 && document.body.getAttribute('data-media-only') !== 'true') {
        // On mobile media screen (non-media-only page) — return to text screen instead of navigating away
        showScreen(0);
      } else {
        // On text screen, desktop, or media-only page — tell parent to navigate to previous page
        window.parent.postMessage({ type: 'navigatePrev' }, '*');
      }
    }
  });

  // Receive triggerNext from parent shell (right-arrow click)
  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'triggerNext') {
      if (reflowApplied && mobileScreen === 0 && currentBottomSection) {
        // Right-arrow on text screen (with a media section) → reveal media screen
        showScreen(1);
      } else {
        // Right-arrow on media screen (or desktop) → fire the nav button to navigate
        var btn = findPageNavButton();
        if (btn) {
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        } else {
          window.parent.postMessage({ type: 'navigate', page: -1 }, '*');
        }
      }
    }
  });


  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var mobile = isMobilePortrait();
      if (mobile && !reflowApplied)      { mobileReflow(); hideAdobeNavButtons(); }
      else if (!mobile && reflowApplied) { revertReflow(); enableAdobeNavButtons(); }
      zoom = 1; px = 0; py = 0;
      reset();
    }, 150);
  });
})();

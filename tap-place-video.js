// AFRAME 컴포넌트 없이 순수 이벤트 방식으로 구현
// xr.js (async)가 AFRAME을 정의한 뒤 a-scene이 초기화되므로
// scene 'loaded' 이벤트를 기다린 후 로직 연결

(function () {
  var currentEntity = null;
  var videoEl = null;
  var prompt = null;

  var pinchActive = false;
  var initialPinchDist = 0;
  var initialScale = 1;

  // ── 영상 배치 ──────────────────────────────────────────────
  function placeVideo(position) {
    if (prompt) prompt.style.display = 'none';  // 탭 후 안내문구 숨김

    // 기존 엔티티 제거
    if (currentEntity && currentEntity.parentNode) {
      currentEntity.parentNode.removeChild(currentEntity);
    }
    currentEntity = null;

    var planeW = 2;          // 가로 2m
    var planeH = planeW * (9 / 16);  // 16:9

    var entity = document.createElement('a-entity');
    entity.setAttribute('position', {
      x: position.x,
      y: position.y + planeH / 2 + 0.02,
      z: position.z,
    });

    var plane = document.createElement('a-plane');
    plane.setAttribute('width', planeW);
    plane.setAttribute('height', planeH);
    // 크로마키: 초록색(#00FF00) 배경 제거
    plane.setAttribute('material',
      'shader:chromakey; src:#chromaVideo; color:#00FF00; transparent:true');
    plane.setAttribute('shadow', 'receive:false');

    entity.appendChild(plane);

    var scene = document.querySelector('a-scene');
    scene.appendChild(entity);
    currentEntity = entity;

    // 탭(사용자 제스처) 후 소리 포함 재생 시도
    videoEl.muted = false;
    videoEl.play().catch(function () {
      videoEl.muted = true;
      videoEl.play().catch(function (err) {
        console.warn('Video play error:', err);
      });
    });
  }

  // ── 핀치 줌 ────────────────────────────────────────────────
  function getTouchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2 && currentEntity) {
      pinchActive = true;
      initialPinchDist = getTouchDist(e.touches);
      var s = currentEntity.object3D ? currentEntity.object3D.scale.x : 1;
      initialScale = s;
    }
  }

  function onTouchMove(e) {
    if (!pinchActive || e.touches.length < 2 || !currentEntity) return;
    var dist = getTouchDist(e.touches);
    var ratio = dist / initialPinchDist;
    var s = Math.max(0.1, Math.min(10, initialScale * ratio));
    if (currentEntity.object3D) {
      currentEntity.object3D.scale.set(s, s, s);
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) {
      pinchActive = false;
    }
  }

  // ── 초기화: scene loaded 이후 연결 ─────────────────────────
  function setupScene() {
    var scene = document.querySelector('a-scene');
    var ground = document.getElementById('ground');
    prompt  = document.getElementById('promptText');
    videoEl = document.getElementById('chromaVideo');

    if (!scene || !ground || !videoEl) {
      // 요소가 아직 없으면 잠시 후 재시도
      setTimeout(setupScene, 100);
      return;
    }

    function attachListeners() {
      // 로딩 완료 → UI 전환
      var loadingText = document.getElementById('loadingText');
      if (loadingText) loadingText.style.display = 'none';
      if (prompt) prompt.style.display = '';

      ground.addEventListener('click', function (e) {
        // 핀치 중에는 탭 무시
        if (pinchActive) return;
        if (e.detail && e.detail.intersection && e.detail.intersection.point) {
          placeVideo(e.detail.intersection.point);
        }
      });

      document.addEventListener('touchstart', onTouchStart, {passive: true});
      document.addEventListener('touchmove',  onTouchMove,  {passive: true});
      document.addEventListener('touchend',   onTouchEnd,   {passive: true});
    }

    if (scene.hasLoaded) {
      attachListeners();
    } else {
      scene.addEventListener('loaded', attachListeners, {once: true});
    }
  }

  // DOM 파싱이 끝난 후 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupScene);
  } else {
    setupScene();
  }
})();

(function () {
  var sceneEl   = null;
  var videoEl   = null;
  var prompt    = null;
  var currentGroup = null;   // THREE.Group (배치된 영상 플레인)

  var pinchActive       = false;
  var initialPinchDist  = 0;
  var initialScale      = 1;

  // ── 크로마키 GLSL 셰이더 ──────────────────────────────────
  var VERT = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
    '}'
  ].join('\n');

  // 단순 RGB 거리 기반 크로마키 (안정적)
  var FRAG = [
    'uniform sampler2D map;',
    'uniform vec3  keyColor;',
    'uniform float similarity;',
    'uniform float smoothness;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec4 c = texture2D(map, vUv);',
    '  float d = distance(c.rgb, keyColor);',
    '  float alpha = smoothstep(similarity - smoothness, similarity + smoothness, d);',
    '  if(alpha < 0.05) discard;',
    '  gl_FragColor = vec4(c.rgb, alpha);',
    '}'
  ].join('\n');

  function makeChromakeyMaterial() {
    var tex = new THREE.VideoTexture(videoEl);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return new THREE.ShaderMaterial({
      uniforms: {
        map:        { value: tex },
        keyColor:   { value: new THREE.Color(0x00FF00) },
        similarity: { value: 0.80 },   // 0~1.7, 높을수록 더 많이 제거
        smoothness: { value: 0.10 }
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest:   false,   // ground box에 가리지 않도록
      depthWrite:  false,
      side: THREE.DoubleSide
    });
  }

  // ── 영상 플레인 배치 ──────────────────────────────────────
  function placeVideo(hitPos) {
    if (prompt) prompt.style.display = 'none';

    var root = sceneEl.object3D;

    // 정리 전에 먼저 스케일 저장
    var keepScale = currentGroup ? currentGroup.scale.x : 1;

    // 기존 오브젝트 정리
    if (currentGroup) {
      root.remove(currentGroup);
      currentGroup.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.uniforms && obj.material.uniforms.map)
            obj.material.uniforms.map.value.dispose();
          obj.material.dispose();
        }
      });
      currentGroup = null;
    }

    var pw = 13;
    var ph = pw * (12 / 16);

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      makeChromakeyMaterial()
    );
    mesh.position.y = ph / 2;

    currentGroup = new THREE.Group();
    currentGroup.position.set(hitPos.x, hitPos.y + 0.02, hitPos.z);
    currentGroup.scale.set(keepScale, keepScale, keepScale);
    currentGroup.add(mesh);
    root.add(currentGroup);
    initialScale = keepScale;

    // 영상 재생 (소리 포함 → 실패 시 음소거)
    videoEl.muted = false;
    videoEl.play().catch(function () {
      videoEl.muted = true;
      videoEl.play().catch(function (e) { console.warn('play error', e); });
    });
  }

  // ── 매 프레임: Y축 lerp 회전 (급격한 변화 완화 → 안정화) ────
  var camPos = new THREE.Vector3();
  function tick() {
    if (currentGroup && sceneEl && sceneEl.camera) {
      sceneEl.camera.getWorldPosition(camPos);
      var dx = camPos.x - currentGroup.position.x;
      var dz = camPos.z - currentGroup.position.z;
      var target = Math.atan2(dx, dz);
      // 각도 차이를 -PI~PI 범위로 정규화 후 lerp
      var diff = target - currentGroup.rotation.y;
      while (diff >  Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      // 0.03rad(약 1.7도) 미만 미세 흔들림은 무시
      if (Math.abs(diff) > 0.03) {
        currentGroup.rotation.y += diff * 0.06;
      }
    }
    requestAnimationFrame(tick);
  }

  // ── 핀치 줌 ───────────────────────────────────────────────
  function dist2(t) {
    var dx = t[0].clientX - t[1].clientX;
    var dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function onTouchStart(e) {
    if (e.touches.length === 2 && currentGroup) {
      pinchActive      = true;
      initialPinchDist = dist2(e.touches);
      initialScale     = currentGroup.scale.x;
    }
  }
  function onTouchMove(e) {
    if (!pinchActive || e.touches.length < 2 || !currentGroup) return;
    var s = Math.max(0.1, Math.min(100, initialScale * dist2(e.touches) / initialPinchDist));
    currentGroup.scale.set(s, s, s);
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) pinchActive = false;
  }

  // ── 초기화 ────────────────────────────────────────────────
  function setup() {
    sceneEl = document.querySelector('a-scene');
    videoEl = document.getElementById('chromaVideo');
    prompt  = document.getElementById('promptText');

    if (!sceneEl || !videoEl) { setTimeout(setup, 100); return; }

    function onLoaded() {
      var loadingEl = document.getElementById('loadingText');
      if (loadingEl) loadingEl.style.display = 'none';
      if (prompt)    prompt.style.display = '';

      var ground = document.getElementById('ground');
      ground.addEventListener('click', function (e) {
        if (pinchActive) return;
        var pt = e.detail && e.detail.intersection && e.detail.intersection.point;
        if (pt) placeVideo(pt);
      });

      document.addEventListener('touchstart', onTouchStart, {passive: true});
      document.addEventListener('touchmove',  onTouchMove,  {passive: true});
      document.addEventListener('touchend',   onTouchEnd,   {passive: true});

      tick();
    }

    if (sceneEl.hasLoaded) onLoaded();
    else sceneEl.addEventListener('loaded', onLoaded, {once: true});
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup);
  else
    setup();
})();

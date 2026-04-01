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

    var pw = 2.5;
    var ph = pw * (9 / 16);

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      makeChromakeyMaterial()
    );
    // 메시 중심을 위로 올려 하단이 그룹 원점(바닥)에 오도록
    // → 핀치로 스케일 키워도 하단은 바닥에 고정, 위로만 늘어남
    mesh.position.y = ph / 2;

    currentGroup = new THREE.Group();
    // 그룹은 바닥 위 살짝에 배치
    currentGroup.position.set(hitPos.x, hitPos.y + 0.02, hitPos.z);
    currentGroup.add(mesh);
    root.add(currentGroup);
    initialScale = 1;

    // 영상 재생 (소리 포함 → 실패 시 음소거)
    videoEl.muted = false;
    videoEl.play().catch(function () {
      videoEl.muted = true;
      videoEl.play().catch(function (e) { console.warn('play error', e); });
    });
  }

  // ── 매 프레임: Y축만 회전해 카메라 바라보기 (사람 기울어짐 방지) ──
  var camPos = new THREE.Vector3();
  function tick() {
    if (currentGroup && sceneEl && sceneEl.camera) {
      sceneEl.camera.getWorldPosition(camPos);
      var dx = camPos.x - currentGroup.position.x;
      var dz = camPos.z - currentGroup.position.z;
      currentGroup.rotation.y = Math.atan2(dx, dz);
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
    var s = Math.max(0.1, Math.min(10, initialScale * dist2(e.touches) / initialPinchDist));
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

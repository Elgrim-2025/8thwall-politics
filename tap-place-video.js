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

  // HSV 기반 크로마키: RGB 거리보다 녹색 계열 판별 정확도 높음
  var FRAG = [
    'uniform sampler2D map;',
    'uniform vec3  keyColor;',
    'uniform float similarity;',
    'uniform float smoothness;',
    'varying vec2 vUv;',
    // RGB → HSV 변환
    'vec3 rgb2hsv(vec3 c){',
    '  vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);',
    '  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));',
    '  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));',
    '  float d=q.x-min(q.w,q.y);',
    '  float e=1.0e-10;',
    '  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);',
    '}',
    'void main(){',
    '  vec4 c = texture2D(map, vUv);',
    '  vec3 kHSV = rgb2hsv(keyColor);',
    '  vec3 pHSV = rgb2hsv(c.rgb);',
    '  float hDiff = abs(pHSV.x - kHSV.x);',
    '  if(hDiff > 0.5) hDiff = 1.0 - hDiff;',
    // 채도 낮으면 배경 아닐 가능성 높음 (스필 보정)
    '  float chromaDist = hDiff * 2.0 + (1.0 - pHSV.y) * 0.5;',
    '  float alpha = smoothstep(similarity - smoothness,',
    '                            similarity + smoothness, chromaDist);',
    '  if(alpha < 0.01) discard;',
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
        similarity: { value: 0.55 },   // 높을수록 더 세게 따냄
        smoothness: { value: 0.05 }    // 낮을수록 경계 선명
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent: true,
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

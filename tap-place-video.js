AFRAME.registerComponent('tap-place-video', {
  init() {
    this.currentEntity = null;
    this.prompt = document.getElementById('promptText');
    this.videoEl = document.getElementById('chromaVideo');

    this.pinchActive = false;
    this.initialPinchDistance = 0;
    this.initialScale = 1;

    // 지면 클릭 → 영상 배치 (하나씩만)
    const ground = document.getElementById('ground');
    ground.addEventListener('click', (e) => {
      // 두 손가락 핀치 중이면 tap 무시
      if (this.pinchActive) return;
      this.placeVideo(e.detail.intersection.point);
    });

    this.setupPinch();
  },

  placeVideo(position) {
    if (this.prompt) this.prompt.style.display = 'none';

    // 기존 엔티티 제거
    if (this.currentEntity) {
      this.currentEntity.parentNode.removeChild(this.currentEntity);
      this.currentEntity = null;
    }

    // 영상 비율 16:9, 폭 2m
    const planeW = 2;
    const planeH = planeW * (9 / 16);

    const entity = document.createElement('a-entity');
    entity.setAttribute('position', {
      x: position.x,
      y: position.y + planeH / 2 + 0.02,  // 바닥에서 살짝 띄움
      z: position.z,
    });

    // 크로마키 영상 플레인
    const plane = document.createElement('a-plane');
    plane.setAttribute('width', planeW);
    plane.setAttribute('height', planeH);
    plane.setAttribute('material', `shader:chromakey; src:#chromaVideo; color:#00FF00; transparent:true`);
    plane.setAttribute('shadow', 'receive:false');

    entity.appendChild(plane);
    this.el.sceneEl.appendChild(entity);
    this.currentEntity = entity;

    // 자동재생 + 소리 허용 (탭 = 사용자 제스처)
    this.videoEl.muted = false;
    this.videoEl.play().catch(() => {
      // 소리 안되면 음소거 후 재시도
      this.videoEl.muted = true;
      this.videoEl.play().catch((err) => console.warn('Video play error:', err));
    });
  },

  setupPinch() {
    const onTouchStart = (e) => {
      if (e.touches.length === 2 && this.currentEntity) {
        this.pinchActive = true;
        this.initialPinchDistance = this.getTouchDist(e.touches);
        this.initialScale = this.currentEntity.object3D.scale.x;
      }
    };

    const onTouchMove = (e) => {
      if (!this.pinchActive || e.touches.length < 2 || !this.currentEntity) return;
      const dist = this.getTouchDist(e.touches);
      const ratio = dist / this.initialPinchDistance;
      const s = Math.max(0.1, Math.min(10, this.initialScale * ratio));
      this.currentEntity.object3D.scale.set(s, s, s);
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        this.pinchActive = false;
      }
    };

    document.addEventListener('touchstart', onTouchStart, {passive: true});
    document.addEventListener('touchmove', onTouchMove, {passive: true});
    document.addEventListener('touchend', onTouchEnd, {passive: true});
  },

  getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },
});

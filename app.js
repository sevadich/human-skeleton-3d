/**
 * 3D Human Skeleton Atlas
 * Anatomical 3D Interactive Explorer based on BodyParts3D & Z-Anatomy
 */

let scene, camera, renderer, controls;
let skeletonGroup, bonesMap = new Map(), bonesDatabase = {};
let currentMaterialType = 'realistic';
let currentOpacity = 1.0;
let isWireframe = false;
let selectedBone = null;
let hoveredBone = null;
let isIsolated = false;
let raycaster, mouse;
let isDragging = false;
let pointerDownPos = { x: 0, y: 0 };

// Camera animation state
let cameraTargetPos = null;
let controlsTargetPos = null;
let isAnimatingCamera = false;

// Preset definitions (in meters)
const PRESETS = {
  front: { cam: new THREE.Vector3(0, 0.9, 2.3), target: new THREE.Vector3(0, 0.9, 0) },
  back: { cam: new THREE.Vector3(0, 0.9, -2.3), target: new THREE.Vector3(0, 0.9, 0) },
  side: { cam: new THREE.Vector3(2.3, 0.9, 0), target: new THREE.Vector3(0, 0.9, 0) },
  skull: { cam: new THREE.Vector3(0, 1.55, 0.55), target: new THREE.Vector3(0, 1.55, 0) },
  spine: { cam: new THREE.Vector3(0, 1.15, -0.75), target: new THREE.Vector3(0, 1.15, 0) },
  thorax: { cam: new THREE.Vector3(0, 1.25, 0.75), target: new THREE.Vector3(0, 1.25, 0) },
  pelvis: { cam: new THREE.Vector3(0, 0.95, 0.65), target: new THREE.Vector3(0, 0.95, 0) },
  hand: { cam: new THREE.Vector3(0.48, 0.78, 0.35), target: new THREE.Vector3(0.42, 0.72, 0) },
  foot: { cam: new THREE.Vector3(0.12, 0.18, 0.4), target: new THREE.Vector3(0.1, 0.05, 0) }
};

// Material definitions
const materials = {
  realistic: new THREE.MeshStandardMaterial({
    color: 0xede4d4,
    roughness: 0.42,
    metalness: 0.05,
    side: THREE.DoubleSide
  }),
  medical: new THREE.MeshStandardMaterial({
    color: 0xd6dbe0,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide
  }),
  xray: new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false
  })
};

// Initialize Application
init();

async function init() {
  const container = document.getElementById('canvas-container');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);
  scene.fog = new THREE.FogExp2(0x0a0e17, 0.12);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 50);
  camera.position.set(0, 0.9, 2.3);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.1;
  controls.maxDistance = 6.0;
  controls.target.set(0, 0.9, 0);
  controls.update();

  // Lighting
  setupLighting();

  // Ground Grid & Studio Pad
  setupEnvironment();

  // Raycaster & Mouse
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Load Anatomical Data & 3D Model
  try {
    await loadBonesDatabase();
    await loadSkeletonModel();
    buildSystemsTree();
    setupEventListeners();
    animate();
  } catch (err) {
    console.error("Initialization failed:", err);
    document.querySelector('.loading-text').textContent = 'Ошибка загрузки: ' + err.message;
  }
}

function setupLighting() {
  const ambient = new THREE.AmbientLight(0x2a3952, 0.8);
  scene.add(ambient);

  // Main Key Light (Soft warm daylight from top front right)
  const keyLight = new THREE.DirectionalLight(0xfffbf2, 1.4);
  keyLight.position.set(3, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  // Soft Fill Light (Cool sky blue from front left)
  const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.8);
  fillLight.position.set(-3, 2, 2.5);
  scene.add(fillLight);

  // Rim / Backlight (Dramatic edge highlights)
  const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
  rimLight.position.set(0, 2, -3);
  scene.add(rimLight);

  // Bottom bounce light (soft upward illumination)
  const bounceLight = new THREE.DirectionalLight(0x1e293b, 0.5);
  bounceLight.position.set(0, -2, 0);
  scene.add(bounceLight);
}

function setupEnvironment() {
  // Circular studio floor
  const floorGeo = new THREE.CircleGeometry(2.5, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0e1422,
    roughness: 0.85,
    metalness: 0.1
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle circular rings
  const ringGeo = new THREE.RingGeometry(1.2, 1.205, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.008;
  scene.add(ring);
}

async function loadBonesDatabase() {
  const resp = await fetch('bones_database.json');
  bonesDatabase = await resp.json();
}

function loadSkeletonModel() {
  return new Promise((resolve, reject) => {
    const loader = new THREE.GLTFLoader();
    const loadingFill = document.getElementById('loading-fill');
    const loadingSub = document.getElementById('loading-sub');

    loader.load('skeleton.glb', (gltf) => {
      skeletonGroup = new THREE.Group();

      const model = gltf.scene;

      // The original model is in millimeters with Z as UP, -Y as front.
      // Rotating by -90 deg (-PI/2) on X turns:
      // Z -> +Y (Up, Head)
      // Y -> -Z, so -Y becomes +Z (Front, Chest facing camera)
      // X -> +X
      model.rotation.x = -Math.PI / 2;
      model.scale.set(0.001, 0.001, 0.001);

      // Group & center vertically
      skeletonGroup.add(model);

      // Traverse all meshes and map to bone names
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Clone realistic material
          const mat = materials.realistic.clone();
          child.material = mat;
          child.userData.originalMaterial = mat;
          child.userData.boneName = child.name;

          // Store reference
          bonesMap.set(child.name, child);
        }
      });

      // Align bounding box so feet rest at Y = 0
      skeletonGroup.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(skeletonGroup);
      const minY = box.min.y;
      skeletonGroup.position.y = -minY; // Place lowest point exactly on ground

      scene.add(skeletonGroup);

      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);

      resolve();
    }, (xhr) => {
      if (xhr.lengthComputable) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        loadingFill.style.width = percent + '%';
        loadingSub.textContent = `Загрузка: ${percent}% (${(xhr.loaded / 1048576).toFixed(1)} / ${(xhr.total / 1048576).toFixed(1)} МБ)`;
      }
    }, (error) => {
      reject(error);
    });
  });
}

function buildSystemsTree() {
  const container = document.getElementById('systems-tree');
  container.innerHTML = '';

  const groups = {
    skull: { title: 'Череп (Cranium)', icon: '💀', bones: [] },
    spine: { title: 'Позвоночник (Columna vertebralis)', icon: '🦴', bones: [] },
    thorax: { title: 'Грудная клетка (Thorax)', icon: '🫁', bones: [] },
    upper_limb: { title: 'Верхние конечности (Руки)', icon: '💪', bones: [] },
    pelvis: { title: 'Тазовый пояс (Pelvis)', icon: '🩻', bones: [] },
    lower_limb: { title: 'Нижние конечности (Ноги)', icon: '🦵', bones: [] }
  };

  // Group bones
  for (const [name, info] of Object.entries(bonesDatabase)) {
    if (groups[info.group]) {
      groups[info.group].bones.push({ name, ...info });
    }
  }

  // Sort groups and build DOM
  for (const [key, grp] of Object.entries(groups)) {
    const card = document.createElement('div');
    card.className = 'system-card';
    card.dataset.group = key;

    card.innerHTML = `
      <div class="system-header">
        <div class="system-info">
          <span>${grp.icon}</span>
          <span class="system-title">${grp.title}</span>
          <span class="system-badge">(${grp.bones.length})</span>
        </div>
        <div class="system-actions">
          <button class="visibility-toggle" title="Показать/скрыть отдел" data-action="toggle-vis">👁</button>
        </div>
      </div>
      <div class="system-bones-list">
        ${grp.bones.map(b => `
          <div class="bone-item" data-bone="${b.name}">
            <span>${b.name_ru}</span>
            <span style="font-size: 10px; color: var(--accent-cyan); font-style: italic;">${b.side !== 'axial' ? (b.side === 'left' ? 'L' : 'R') : ''}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Toggle expand
    const header = card.querySelector('.system-header');
    const list = card.querySelector('.system-bones-list');
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle-vis"]')) return;
      const isOpen = list.style.display === 'flex';
      list.style.display = isOpen ? 'none' : 'flex';
      card.classList.toggle('expanded', !isOpen);
    });

    // Visibility toggle for the whole group
    const visBtn = card.querySelector('[data-action="toggle-vis"]');
    let groupVisible = true;
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      groupVisible = !groupVisible;
      visBtn.textContent = groupVisible ? '👁' : '🚫';
      visBtn.style.opacity = groupVisible ? '1' : '0.5';

      grp.bones.forEach(b => {
        const mesh = bonesMap.get(b.name);
        if (mesh) mesh.visible = groupVisible;
      });
    });

    // Individual bone item click
    card.querySelectorAll('.bone-item').forEach(item => {
      item.addEventListener('click', () => {
        const boneName = item.dataset.bone;
        selectBoneByName(boneName);
        focusBoneByName(boneName);
      });
    });

    container.appendChild(card);
  }
}

// Raycasting & Interaction
function setupEventListeners() {
  const container = document.getElementById('canvas-container');

  window.addEventListener('resize', onWindowResize);

  container.addEventListener('pointerdown', (e) => {
    isDragging = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('pointermove', (e) => {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 5) isDragging = true;

    // Update mouse coords for raycaster
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    handleHover(e);
  });

  container.addEventListener('pointerup', (e) => {
    if (!isDragging) {
      handleClick();
    }
  });

  // Search input handler
  setupSearch();

  // Presets
  document.querySelectorAll('.camera-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.camera-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetKey = btn.dataset.preset;
      animateToPreset(presetKey);
    });
  });

  // Material buttons
  document.getElementById('mat-realistic').addEventListener('click', () => setMaterialType('realistic'));
  document.getElementById('mat-medical').addEventListener('click', () => setMaterialType('medical'));
  document.getElementById('mat-xray').addEventListener('click', () => setMaterialType('xray'));
  document.getElementById('mat-wireframe').addEventListener('click', toggleWireframe);

  // Opacity Slider
  const opacitySlider = document.getElementById('opacity-slider');
  opacitySlider.addEventListener('input', (e) => {
    currentOpacity = parseFloat(e.target.value) / 100;
    updateBonesOpacity();
  });

  // Auto-rotate
  const btnAutorotate = document.getElementById('btn-autorotate');
  btnAutorotate.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 1.5;
    btnAutorotate.classList.toggle('active', controls.autoRotate);
  });

  // Reset view
  document.getElementById('btn-reset-view').addEventListener('click', resetAll);

  // Inspector actions
  document.getElementById('btn-close-inspector').addEventListener('click', () => {
    deselectBone();
  });

  document.getElementById('btn-focus-bone').addEventListener('click', () => {
    if (selectedBone) focusBone(selectedBone);
  });

  document.getElementById('btn-isolate-bone').addEventListener('click', () => {
    if (selectedBone) toggleIsolateBone();
  });

  document.getElementById('btn-export-bone').addEventListener('click', () => {
    if (selectedBone) exportMeshToOBJ(selectedBone);
  });

  document.getElementById('btn-export-all').addEventListener('click', () => {
    exportSkeletonGLB();
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  btnToggleSidebar.addEventListener('click', () => {
    const isHidden = sidebar.style.transform === 'translateX(-360px)';
    sidebar.style.transform = isHidden ? 'translateX(0)' : 'translateX(-360px)';
    btnToggleSidebar.classList.toggle('active', isHidden);
  });

  // Help modal
  const helpModal = document.getElementById('help-modal');
  document.getElementById('btn-help').addEventListener('click', () => {
    helpModal.style.display = 'block';
  });
  document.getElementById('btn-close-help').addEventListener('click', () => {
    helpModal.style.display = 'none';
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      resetAll();
    } else if (e.code === 'KeyF') {
      if (selectedBone) focusBone(selectedBone);
    } else if (e.code === 'KeyI') {
      if (selectedBone) toggleIsolateBone();
    } else if (e.code === 'KeyX') {
      setMaterialType(currentMaterialType === 'xray' ? 'realistic' : 'xray');
    } else if (e.code === 'Escape') {
      if (helpModal.style.display === 'block') {
        helpModal.style.display = 'none';
      } else {
        deselectBone();
      }
    }
  });
}

function handleHover(e) {
  if (!skeletonGroup) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(skeletonGroup.children[0].children, true);

  const tooltip = document.getElementById('hover-tooltip');

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    if (hitMesh !== hoveredBone && hitMesh !== selectedBone) {
      if (hoveredBone && hoveredBone !== selectedBone) {
        resetMeshHighlight(hoveredBone);
      }
      hoveredBone = hitMesh;
      applyMeshHighlight(hitMesh, 0x38bdf8, 0.3);
    }

    const info = bonesDatabase[hitMesh.name];
    if (info) {
      tooltip.textContent = info.name_ru;
      tooltip.style.left = e.clientX + 'px';
      tooltip.style.top = e.clientY + 'px';
      tooltip.style.display = 'block';
    }
    document.body.style.cursor = 'pointer';
  } else {
    if (hoveredBone && hoveredBone !== selectedBone) {
      resetMeshHighlight(hoveredBone);
      hoveredBone = null;
    }
    tooltip.style.display = 'none';
    document.body.style.cursor = 'default';
  }
}

function handleClick() {
  if (!skeletonGroup) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(skeletonGroup.children[0].children, true);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    selectBone(hitMesh);
  } else {
    deselectBone();
  }
}

function selectBone(mesh) {
  if (selectedBone) {
    resetMeshHighlight(selectedBone);
  }

  selectedBone = mesh;
  applyMeshHighlight(selectedBone, 0x38bdf8, 0.7);

  // Update inspector panel
  updateInspector(mesh.name);

  // Highlight active tree item
  document.querySelectorAll('.bone-item').forEach(el => {
    el.classList.toggle('active', el.dataset.bone === mesh.name);
  });
}

function selectBoneByName(name) {
  const mesh = bonesMap.get(name);
  if (mesh) {
    selectBone(mesh);
  }
}

function deselectBone() {
  if (selectedBone) {
    resetMeshHighlight(selectedBone);
    selectedBone = null;
  }
  if (isIsolated) {
    toggleIsolateBone();
  }
  document.getElementById('inspector-panel').classList.add('hidden');
  document.querySelectorAll('.bone-item').forEach(el => el.classList.remove('active'));
}

function updateInspector(name) {
  const info = bonesDatabase[name];
  if (!info) return;

  document.getElementById('panel-bone-group').textContent = info.group_name || 'Скелет';
  document.getElementById('panel-bone-ru').textContent = info.name_ru;
  document.getElementById('panel-bone-la').textContent = info.name_la || '—';
  document.getElementById('panel-bone-en').textContent = info.name_en;
  document.getElementById('panel-bone-desc').textContent = info.description;

  const sideMap = { left: 'Левая сторона', right: 'Правая сторона', axial: 'Осевой скелет' };
  document.getElementById('panel-bone-side').textContent = sideMap[info.side] || info.side;
  document.getElementById('panel-bone-fma').textContent = info.fmaId || info.bpId || 'BP3D';

  const panel = document.getElementById('inspector-panel');
  panel.classList.remove('hidden');
}

function applyMeshHighlight(mesh, hexColor, emissiveIntensity) {
  if (!mesh.material) return;
  mesh.material.emissive = new THREE.Color(hexColor);
  mesh.material.emissiveIntensity = emissiveIntensity;
}

function resetMeshHighlight(mesh) {
  if (!mesh.material) return;
  if (currentMaterialType === 'xray') {
    mesh.material.emissive = new THREE.Color(0x0284c7);
    mesh.material.emissiveIntensity = 0.4;
  } else {
    mesh.material.emissive = new THREE.Color(0x000000);
    mesh.material.emissiveIntensity = 0.0;
  }
}

function focusBone(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const dist = Math.max(maxDim * 2.5, 0.25);
  const targetCamPos = center.clone().add(new THREE.Vector3(0, maxDim * 0.3, dist));

  smoothMoveCamera(targetCamPos, center);
}

function focusBoneByName(name) {
  const mesh = bonesMap.get(name);
  if (mesh) focusBone(mesh);
}

function toggleIsolateBone() {
  if (!selectedBone) return;
  isIsolated = !isIsolated;

  const btnIsolate = document.getElementById('btn-isolate-bone');
  btnIsolate.textContent = isIsolated ? '↩ Показать все' : '👁 Изолировать';
  btnIsolate.classList.toggle('active', isIsolated);

  bonesMap.forEach((mesh) => {
    if (mesh === selectedBone) {
      mesh.visible = true;
    } else {
      mesh.visible = !isIsolated;
    }
  });

  if (isIsolated) {
    focusBone(selectedBone);
  }
}

function resetAll() {
  deselectBone();
  bonesMap.forEach(mesh => {
    mesh.visible = true;
    resetMeshHighlight(mesh);
  });
  isIsolated = false;
  document.getElementById('btn-isolate-bone').textContent = '👁 Изолировать';
  document.getElementById('btn-isolate-bone').classList.remove('active');

  animateToPreset('front');
}

// Materials & Appearance
function setMaterialType(type) {
  currentMaterialType = type;

  document.querySelectorAll('#bottom-toolbar .btn-tool').forEach(b => {
    if (b.id.startsWith('mat-') && b.id !== 'mat-wireframe') {
      b.classList.remove('active');
    }
  });
  const activeBtn = document.getElementById(`mat-${type}`);
  if (activeBtn) activeBtn.classList.add('active');

  const baseMat = materials[type];

  bonesMap.forEach(mesh => {
    const newMat = baseMat.clone();
    newMat.wireframe = isWireframe;
    if (type !== 'xray') {
      newMat.transparent = currentOpacity < 1.0;
      newMat.opacity = currentOpacity;
    }
    mesh.material = newMat;
  });

  if (selectedBone) {
    applyMeshHighlight(selectedBone, 0x38bdf8, 0.7);
  }
}

function toggleWireframe() {
  isWireframe = !isWireframe;
  document.getElementById('mat-wireframe').classList.toggle('active', isWireframe);

  bonesMap.forEach(mesh => {
    if (mesh.material) mesh.material.wireframe = isWireframe;
  });
}

function updateBonesOpacity() {
  if (currentMaterialType === 'xray') return;

  bonesMap.forEach(mesh => {
    if (mesh.material) {
      mesh.material.transparent = currentOpacity < 1.0;
      mesh.material.opacity = currentOpacity;
    }
  });
}

// Smooth camera movement
function smoothMoveCamera(targetCam, targetControls) {
  cameraTargetPos = targetCam.clone();
  controlsTargetPos = targetControls.clone();
  isAnimatingCamera = true;
}

function animateToPreset(key) {
  const p = PRESETS[key];
  if (p) {
    smoothMoveCamera(p.cam, p.target);
  }
}

// Search Feature
function setupSearch() {
  const input = document.getElementById('bone-search');
  const resultsDiv = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsDiv.style.display = 'none';
      return;
    }

    const matches = [];
    for (const [name, info] of Object.entries(bonesDatabase)) {
      const matchRu = info.name_ru.toLowerCase().includes(q);
      const matchLa = (info.name_la || '').toLowerCase().includes(q);
      const matchEn = info.name_en.toLowerCase().includes(q);

      if (matchRu || matchLa || matchEn) {
        matches.push({ name, ...info });
      }
      if (matches.length >= 10) break;
    }

    if (matches.length > 0) {
      resultsDiv.innerHTML = matches.map(m => `
        <div class="search-item" data-bone="${m.name}">
          <div class="search-item-ru">${m.name_ru}</div>
          <div class="search-item-la">${m.name_la || m.name_en}</div>
        </div>
      `).join('');
      resultsDiv.style.display = 'block';

      resultsDiv.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => {
          const boneName = el.dataset.bone;
          selectBoneByName(boneName);
          focusBoneByName(boneName);
          resultsDiv.style.display = 'none';
          input.value = '';
        });
      });
    } else {
      resultsDiv.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">Кость не найдена</div>';
      resultsDiv.style.display = 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      resultsDiv.style.display = 'none';
    }
  });
}

// 3D Exporters
function exportMeshToOBJ(mesh) {
  if (typeof THREE.OBJExporter === 'undefined') {
    alert('OBJ Exporter недоступен.');
    return;
  }
  const exporter = new THREE.OBJExporter();
  const result = exporter.parse(mesh);
  const blob = new Blob([result], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mesh.name}.obj`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSkeletonGLB() {
  if (typeof THREE.GLTFExporter === 'undefined') {
    alert('GLTF Exporter недоступен.');
    return;
  }
  const exporter = new THREE.GLTFExporter();
  exporter.parse(skeletonGroup, (gltf) => {
    const blob = new Blob([gltf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `human_skeleton_bodyparts3d.glb`;
    a.click();
    URL.revokeObjectURL(url);
  }, { binary: true });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Smooth camera transition
  if (isAnimatingCamera && cameraTargetPos && controlsTargetPos) {
    camera.position.lerp(cameraTargetPos, 0.08);
    controls.target.lerp(controlsTargetPos, 0.08);

    if (camera.position.distanceTo(cameraTargetPos) < 0.01 && controls.target.distanceTo(controlsTargetPos) < 0.01) {
      camera.position.copy(cameraTargetPos);
      controls.target.copy(controlsTargetPos);
      isAnimatingCamera = false;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

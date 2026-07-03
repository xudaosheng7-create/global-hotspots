/**
 * Three.js 3D 地球核心模块
 * 深蓝色自转地球 + 大气层光晕 + 热点光点渲染 + 交互
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── 从 window 读取配置（由 config.js 注入） ──
const {
  GLOBE_RADIUS, CAMERA_NEAR, CAMERA_FAR, AUTO_ROTATE_SPEED,
  POINT_BASE_SIZE, POINT_MAX_SIZE, TECH_FINANCE_SCALE, MAX_POINTS,
  isHighlightEvent, latLonToVec3,
  HIGHLIGHT_TECH_COLOR, HIGHLIGHT_FINANCE_COLOR,
} = window;

// ── 全局引用 ──
let scene, camera, renderer, controls, globeGroup;
let pointMeshes = [];      // 光点 InstancedMesh（用于 raycasting）
let pointData = [];        // 与 pointMeshes 一一对应的事件数据
let raycaster, mouse;
let hoveredPoint = null;
let autoRotate = true;
let animationId;

// ── Sun Direction (基于 UTC 时间) ──────────────────
function getSunDirection() {
  const now = new Date();
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  // 太阳直射经度：UTC 12:00 时太阳在 0° 经线
  const sunLon = (utcHours - 12) * 15;

  // 太阳赤纬（近似）：夏至 +23.44°，冬至 -23.44°
  const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000);
  const declination = 23.44 * Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 80));

  // 转为 3D 方向向量
  return latLonToVec3(declination, sunLon, 1);
}

// ── Anim loop callback ──
let onAnimateCallback = null;

// ── 视角追踪 ──
let lastViewUpdate = 0;
const VIEW_UPDATE_INTERVAL = 1500; // ms，更新频率
let currentViewLat = 0, currentViewLon = 0;

export function initGlobe(canvas, { onPointHover, onPointClick, onFrame } = {}) {
  // ═══ Scene ═══
  scene = new THREE.Scene();

  // ═══ Camera ═══
  camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
  camera.position.set(0, 3, 14);
  camera.lookAt(0, 0, 0);

  // ═══ Renderer ═══
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ═══ Lights ═══
  const ambientLight = new THREE.AmbientLight(0x8899aa, 0.7);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(5, 5, 8);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x778899, 0.5);
  fillLight.position.set(-5, -1, -3);
  scene.add(fillLight);

  // ═══ Globe Group ═══
  globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // ═══ Earth Sphere (真实纹理 + 暗蓝调色) ═══
  const earthGeom = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 128);

  const texLoader = new THREE.TextureLoader();
  const earthTex = texLoader.load("lib/earth.jpg");
  earthTex.colorSpace = THREE.SRGBColorSpace;

  // Phong材质：纹理原色，清晰锐利
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTex,
    shininess: 2,
    specular: new THREE.Color(0x333333),
    color: new THREE.Color(0xffffff),
  });
  const earthMesh = new THREE.Mesh(earthGeom, earthMat);
  globeGroup.add(earthMesh);

  // ═══ Night Overlay (昼夜效果) ═══
  const sunDir = getSunDirection();
  const nightGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.004, 128, 128);
  const nightMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      uniform vec3 uSunDir;
      void main() {
        float NdotL = dot(normalize(vNormal), normalize(uSunDir));
        // NdotL > 0 → 白天（透明），NdotL < 0 → 黑夜（暗色）
        // smooth twilight transition
        float night = smoothstep(0.15, -0.1, NdotL);
        vec4 nightColor = vec4(0.01, 0.02, 0.06, night * 0.75);
        gl_FragColor = nightColor;
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const nightMesh = new THREE.Mesh(nightGeom, nightMat);
  nightMesh.name = "nightOverlay";
  globeGroup.add(nightMesh);

  // ═══ Wireframe Grid (赛博网格) ═══
  const wireGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.003, 72, 36);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x4FC3F7,
    wireframe: true,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  globeGroup.add(wireMesh);

  // ═══ City Lights (表面亮点，模拟城市灯光) ═══
  const dotsCount = 3000;
  const dotsGeom = new THREE.BufferGeometry();
  const dotsPositions = new Float32Array(dotsCount * 3);
  const dotsColors = new Float32Array(dotsCount * 3);
  for (let i = 0; i < dotsCount; i++) {
    // 随机球面分布
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = GLOBE_RADIUS * 1.005;
    dotsPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dotsPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dotsPositions[i * 3 + 2] = r * Math.cos(phi);

    // 蓝青色系
    const brightness = 0.3 + Math.random() * 0.7;
    dotsColors[i * 3] = 0.25 * brightness;
    dotsColors[i * 3 + 1] = 0.76 * brightness;
    dotsColors[i * 3 + 2] = 0.97 * brightness;
  }
  dotsGeom.setAttribute("position", new THREE.BufferAttribute(dotsPositions, 3));
  dotsGeom.setAttribute("color", new THREE.BufferAttribute(dotsColors, 3));
  const dotsMat = new THREE.PointsMaterial({
    size: 0.025,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
  });
  const dotsMesh = new THREE.Points(dotsGeom, dotsMat);
  globeGroup.add(dotsMesh);

  // ═══ Atmosphere Glow (赛博大气光环) ═══
  const atmosGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 64, 64);
  const atmosMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = 1.0 - abs(dot(vNormal, viewDir));
        // 更锐利的边缘发光
        float intensity = pow(fresnel, 4.0) * 0.6 + pow(fresnel, 2.0) * 0.1;
        gl_FragColor = vec4(0.31, 0.76, 0.97, intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmosMesh = new THREE.Mesh(atmosGeom, atmosMat);
  globeGroup.add(atmosMesh);

  // ═══ Stars Background ═══
  const starsGeom = new THREE.BufferGeometry();
  const starsCount = 2000;
  const starsPositions = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    const r = 30 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starsPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starsPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starsPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  starsGeom.setAttribute("position", new THREE.BufferAttribute(starsPositions, 3));
  const starsMat = new THREE.PointsMaterial({
    color: 0x8899cc,
    size: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const stars = new THREE.Points(starsGeom, starsMat);
  scene.add(stars);

  // ═══ OrbitControls ═══
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 30;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);

  // ═══ Raycaster ═══
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.3;
  mouse = new THREE.Vector2();

  // ═══ Events ═══
  window.addEventListener("resize", onResize);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onClick);

  // ═══ Callbacks ═══
  onAnimateCallback = onFrame || null;

  // ═══ Start ═══
  animate();
}

// ── Event Points Rendering ───────────────────────────
export function renderEventPoints(events) {
  // 清除旧的光点
  if (pointMeshes.length > 0) {
    pointMeshes.forEach(m => globeGroup.remove(m));
    pointMeshes = [];
    pointData = [];
  }

  if (!events || events.length === 0) return;

  // 过滤可见 + 限制数量
  const filtered = events.filter(e => e._visible !== false).slice(0, MAX_POINTS);
  const count = filtered.length;

  // 判断是否科技/金融高亮
  const getEventColor = (event) => {
    const hl = isHighlightEvent(event);
    if (hl === "tech") return HIGHLIGHT_TECH_COLOR;
    if (hl === "finance") return HIGHLIGHT_FINANCE_COLOR;
    return event.color || "#4FC3F7";
  };

  const getEventSize = (event) => {
    const baseSize = event._aggregated
      ? POINT_BASE_SIZE * 1.4
      : POINT_BASE_SIZE;
    // 按 importance 缩放
    const impScale = Math.min(event.importance / 50, 1);
    const size = baseSize + impScale * (POINT_MAX_SIZE - baseSize);
    // 科技/金融放大
    const hl = isHighlightEvent(event);
    return (hl !== "general") ? size * TECH_FINANCE_SCALE : size;
  };

  // 同坐标聚合
  const aggregated = aggregateByLocation(filtered);

  // 生成每个光点的小圆柱（从球面突出）
  const pointGeom = new THREE.CylinderGeometry(1, 1, 0.15, 8);
  const baseMat = new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.2,
  });

  for (const evt of aggregated) {
    const pos = latLonToVec3(evt.lat, evt.lon, GLOBE_RADIUS * 1.025);
    const size = getEventSize(evt);
    const color = getEventColor(evt);

    // 创建小光点（扁圆柱，面向球心）
    const mat = baseMat.clone();
    mat.color.set(color);
    mat.emissive.set(color);
    mat.emissiveIntensity = 0.5;

    const pointMesh = new THREE.Mesh(pointGeom, mat);
    pointMesh.position.set(pos.x, pos.y, pos.z);

    // 让光点朝向球心方向
    const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    pointMesh.setRotationFromQuaternion(quaternion);

    // 缩放
    pointMesh.scale.setScalar(size);

    // 存储事件数据引用
    pointMesh.userData = { event: evt, originalEvents: evt._originals || null };
    pointMesh.renderOrder = 1;

    globeGroup.add(pointMesh);
    pointMeshes.push(pointMesh);
    pointData.push(evt);
  }
}

// ── 同坐标聚合 ──────────────────────────────────────
function aggregateByLocation(events) {
  const map = new Map();
  const result = [];

  for (const evt of events) {
    const key = `${evt.lat.toFixed(2)},${evt.lon.toFixed(2)}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing._originals.push(evt);
      existing.importance = Math.max(existing.importance, evt.importance);
      existing._aggregated = true;
      existing._count++;
    } else {
      const copy = { ...evt, _originals: [evt], _aggregated: false, _count: 1 };
      map.set(key, copy);
      result.push(copy);
    }
  }

  return result;
}

// ── Raycaster Interaction ────────────────────────────
function getIntersections(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(pointMeshes);
}

function onMouseMove(event) {
  const intersections = getIntersections(event);
  if (intersections.length > 0) {
    const obj = intersections[0].object;
    if (hoveredPoint !== obj) {
      resetHover();
      hoveredPoint = obj;
      obj.material = obj.material.clone();
      obj.material.emissiveIntensity = 1.2;
      obj.scale.multiplyScalar(1.3);
      document.body.style.cursor = "pointer";
    }
  } else {
    resetHover();
    document.body.style.cursor = "default";
  }
}

function onClick(event) {
  const intersections = getIntersections(event);
  if (intersections.length > 0) {
    const obj = intersections[0].object;
    const evtData = obj.userData?.event;
    if (evtData && window._onGlobePointClick) {
      window._onGlobePointClick(evtData);
    }
  }
}

function resetHover() {
  if (hoveredPoint) {
    hoveredPoint.material.emissiveIntensity = 0.5;
    const origSize = hoveredPoint.userData?.event
      ? (() => {
          const hl = isHighlightEvent(hoveredPoint.userData.event);
          const base = hoveredPoint.userData.event._aggregated
            ? POINT_BASE_SIZE * 1.4 : POINT_BASE_SIZE;
          const impScale = Math.min(hoveredPoint.userData.event.importance / 50, 1);
          const size = base + impScale * (POINT_MAX_SIZE - base);
          return (hl !== "general") ? size * TECH_FINANCE_SCALE : size;
        })()
      : 0.08;
    hoveredPoint.scale.setScalar(origSize);
    hoveredPoint = null;
  }
}

// ── Category Visibility Toggle ───────────────────────
export function setCategoryVisible(categoryCode, visible) {
  for (const mesh of pointMeshes) {
    const evt = mesh.userData?.event;
    if (evt && evt.category_code === categoryCode) {
      mesh.visible = visible;
    }
  }
}

// ── Animation Loop ───────────────────────────────────
function animate() {
  animationId = requestAnimationFrame(animate);

  controls.update();

  // 缓慢旋转星星
  const stars = scene.children.find(c => c instanceof THREE.Points);
  if (stars) {
    stars.rotation.y += 0.0001;
    stars.rotation.x += 0.00005;
  }

  // 追踪当前视角朝向的地球区域
  const now = performance.now();
  if (now - lastViewUpdate > VIEW_UPDATE_INTERVAL && pointData.length > 0) {
    lastViewUpdate = now;
    updateCurrentView();
  }

  if (onAnimateCallback) onAnimateCallback();

  renderer.render(scene, camera);
}

// ── 视角区域分析 ──────────────────────────────────────
function updateCurrentView() {
  // 相机到球心的方向 → 当前在看的那个球面点
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // 相机位置在球心外，看的是球心方向的反向
  const lookTarget = camera.position.clone().add(dir.clone().multiplyScalar(
    -camera.position.length() / dir.dot(camera.position.clone().normalize())
  ));

  // 实际：相机看球心，所以"正面"就是相机→球心方向在球面上的投影
  const camToCenter = new THREE.Vector3().subVectors(
    new THREE.Vector3(0, 0, 0), camera.position
  ).normalize();

  // 球面点 = camToCenter * GLOBE_RADIUS
  const surfacePoint = camToCenter.clone().multiplyScalar(GLOBE_RADIUS);

  // 转 lat/lon（与 latLonToVec3 互逆）
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, surfacePoint.y / GLOBE_RADIUS))) * (180 / Math.PI);
  const lon = Math.atan2(surfacePoint.z, -surfacePoint.x) * (180 / Math.PI) - 180;

  currentViewLat = lat;
  currentViewLon = lon;

  // 找到最近的事件 (视野范围内，~40° 角度范围)
  const nearby = findNearbyEvents(lat, lon, 60);
  // 即使附近没事件也通知（避免面板消失），传最近的全局热点
  const topEvents = nearby.length > 0
    ? nearby.slice(0, 8)
    : pointData.slice(0, 5);  // fallback: 全局 top 5
  if (window._onViewChange) {
    window._onViewChange({ lat: lat.toFixed(1), lon: lon.toFixed(1), events: topEvents });
  }
}

function findNearbyEvents(lat, lon, maxDistDeg) {
  const nearby = [];
  for (const evt of pointData) {
    const dLat = evt.lat - lat;
    const dLon = evt.lon - lon;
    // 简单欧几里得近似（在不太靠近极地时可用）
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < maxDistDeg) {
      nearby.push({ ...evt, _dist: dist });
    }
  }
  nearby.sort((a, b) => b.importance - a.importance);
  return nearby;
}

export function getCurrentView() {
  return { lat: currentViewLat, lon: currentViewLon };
}

// ── Resize Handler ───────────────────────────────────
function onResize() {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
}

// ── Dispose ──────────────────────────────────────────
export function disposeGlobe() {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener("resize", onResize);
  if (renderer) renderer.dispose();
  scene?.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

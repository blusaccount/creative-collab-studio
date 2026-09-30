import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EngineTarget, MapType, MeshSpec, Scene, Ticket, ToolSettings, UvIsland } from '../types';
import { composeModelMapCanvas, modelMapFallbackColor } from '../drawing/compose';
import { MAP_TYPES } from '../scenes/maps';
import { t } from '../i18n';
import { Icon } from './Icon';

/** Rough humanoid proportions for the built-in preview mesh, keyed by island name. */
const PART_TRANSFORM: Record<string, { w: number; h: number; d: number; x: number; y: number; z: number }> = {
  HEAD: { w: 0.55, h: 0.55, d: 0.55, x: 0, y: 1.5, z: 0 },
  TORSO: { w: 0.85, h: 0.95, d: 0.5, x: 0, y: 0.7, z: 0 },
  'ARM L': { w: 0.24, h: 0.9, d: 0.24, x: -0.62, y: 0.62, z: 0 },
  'ARM R': { w: 0.24, h: 0.9, d: 0.24, x: 0.62, y: 0.62, z: 0 },
  'LEG L': { w: 0.32, h: 0.95, d: 0.32, x: -0.22, y: -0.45, z: 0 },
  'LEG R': { w: 0.32, h: 0.95, d: 0.32, x: 0.22, y: -0.45, z: 0 },
  CAPE: { w: 1.0, h: 1.5, d: 0.06, x: 0, y: 0.6, z: -0.34 },
};

interface PreviewState {
  renderer: THREE.WebGLRenderer;
  scene3: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  defaultMesh: THREE.Mesh;
  modelRoot: THREE.Group | null;
  textures: THREE.Texture[];
  standardMaterials: Map<THREE.Mesh, THREE.MeshStandardMaterial>;
  tickets: Ticket[];
  sceneDimensions: { width: number; height: number };
  sceneTarget?: EngineTarget;
  uvLayout: UvIsland[];
  flipY: boolean;
  token: number;
  visibleMaps: Set<MapType>;
  liveMap?: MapType;
  liveCanvas?: HTMLCanvasElement;
  liveTicketId?: string;
  livePart?: UvIsland;
  liveTextureCanvas: HTMLCanvasElement | null;
  liveTextureMap?: MapType;
  liveVersion?: number;
  liveTexture: THREE.Texture | null;
}

interface PaintMode {
  ticketId: string;
  partName?: string;
  settings: ToolSettings;
  onStart: (uv: { u: number; v: number }) => void;
  onMove: (uv: { u: number; v: number }) => void;
  onEnd: () => void;
}

function canvasHasContent(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 24;
  probe.height = 24;
  const ctx = probe.getContext('2d');
  if (!ctx) return true;
  ctx.drawImage(canvas, 0, 0, 24, 24);
  const data = ctx.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) return true;
  }
  return false;
}

async function applyTextures(state: PreviewState): Promise<void> {
  state.textures.forEach((texture) => texture.dispose());
  state.textures = [];
  state.liveTexture = null;

  const availableMaps = MAP_TYPES.filter((map) =>
    state.tickets.some((ticket) =>
      ticket.materialChannels?.some((channel) => channel.map === map) || ticket.mapType === map,
    ),
  );
  const byMap: Partial<Record<MapType, THREE.Texture>> = {};
  for (const map of availableMaps) {
    if (!state.visibleMaps.has(map)) continue;
    const canvas = await composeModelMapCanvas(
      state.tickets,
      map,
      state.sceneDimensions,
      map === state.liveMap && state.liveCanvas && state.liveTicketId
        ? { ticketId: state.liveTicketId, canvas: state.liveCanvas }
        : undefined,
    );
    if (!canvas || !canvasHasContent(canvas)) continue;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = map === 'basecolor' || map === 'emissive' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = state.flipY;
    texture.needsUpdate = true;
    byMap[map] = texture;
    state.textures.push(texture);
    if (map === state.liveMap && state.liveCanvas && state.liveTicketId) {
      state.liveTexture = texture;
      state.liveTextureCanvas = canvas;
      state.liveTextureMap = map;
    }
  }

  const meshes: THREE.Mesh[] = [];
  if (state.modelRoot) {
    state.modelRoot.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
  } else {
    meshes.push(state.defaultMesh);
  }

  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;

  for (const mesh of meshes) {
    if (!state.standardMaterials.has(mesh)) {
      state.standardMaterials.set(
        mesh,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }),
      );
    }
    const material = state.standardMaterials.get(mesh)!;
    const packed = byMap.packed;
    // three reads roughness from G and metalness from B, so an Unreal ORM map can
    // be used directly. Unity packs metal(R)/smoothness(A), which three cannot
    // read as roughness/metalness — so we do not use a Unity pack for PBR.
    const packedPbr = packed && state.sceneTarget !== 'unity' ? packed : null;
    material.map = byMap.other ?? byMap.basecolor ?? null;
    material.normalMap = byMap.normal ?? null;
    material.roughnessMap = byMap.roughness ?? packedPbr ?? null;
    material.metalnessMap = byMap.metallic ?? packedPbr ?? null;
    // AO sits in R only for Unreal ORM; glTF keeps AO separate.
    material.aoMap = byMap.ao ?? (packed && (state.sceneTarget === 'unreal' || state.sceneTarget === undefined) ? packed : null);
    material.emissiveMap = byMap.emissive ?? null;
    material.emissive = new THREE.Color(byMap.emissive ? 0xffffff : 0x000000);
    material.metalness = byMap.metallic || packedPbr ? 1 : 0;
    material.roughness = byMap.roughness || packedPbr ? 1 : 0.65;
    material.alphaMap = byMap.opacity ?? null;
    material.transparent = Boolean(byMap.opacity);
    material.displacementMap = byMap.height ?? null;
    material.displacementScale = byMap.height ? 0.035 : 0;
    if ((byMap.ao || byMap.packed) && mesh.geometry.attributes.uv && !mesh.geometry.attributes.uv2) {
      mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
    }
    material.needsUpdate = true;
    mesh.material = material;
  }
}

function matchingPartMeshes(root: THREE.Object3D, part: string): THREE.Mesh[] {
  const normalized = part.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matching: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalized)) {
      matching.push(mesh);
    }
  });
  return matching;
}

function focusModelPart(state: PreviewState, part?: string): void {
  const root = state.modelRoot;
  if (!root) return;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  let matching = part ? matchingPartMeshes(root, part) : [];
  // Imported .glb meshes often don't carry our part names — fall back to
  // matching by UV region (the mesh whose UV centroid sits in the part island).
  if (part && matching.length === 0) {
    const island = state.uvLayout.find((entry) => entry.name === part);
    if (island) {
      const vLow = 1 - island.y - island.h;
      const vHigh = 1 - island.y;
      matching = meshes.filter((mesh) => {
        const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute | undefined;
        if (!uv || uv.count === 0) return false;
        let sumU = 0;
        let sumV = 0;
        for (let i = 0; i < uv.count; i += 1) {
          sumU += uv.getX(i);
          sumV += uv.getY(i);
        }
        const cu = sumU / uv.count;
        const cv = sumV / uv.count;
        return cu >= island.x - 0.02 && cu <= island.x + island.w + 0.02 && cv >= vLow - 0.02 && cv <= vHigh + 0.02;
      });
    }
  }
  const hasPartMatch = matching.length > 0;
  meshes.forEach((mesh) => {
    mesh.visible = !hasPartMatch || matching.includes(mesh);
  });
  if (!hasPartMatch) {
    state.camera.position.set(0, 0.5, 2.9);
    state.controls.target.set(0, 0, 0);
  } else {
    const bounds = new THREE.Box3().setFromObject(matching[0]);
    matching.slice(1).forEach((mesh) => bounds.expandByObject(mesh));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const halfFov = THREE.MathUtils.degToRad(state.camera.fov / 2);
    const distance = Math.max(
      1.2,
      (size.y / 2 / Math.tan(halfFov)) * 1.4,
      (size.x / 2 / Math.tan(halfFov) / state.camera.aspect) * 1.4,
      (size.z / 2 / Math.tan(halfFov)) * 1.4,
    );
    state.controls.target.copy(center);
    state.camera.position.set(center.x, center.y, center.z + distance);
    state.camera.lookAt(center);
  }
  state.controls.update();
}

function updateLiveTexture(state: PreviewState): void {
  const textureCanvas = state.liveTextureCanvas;
  const liveCanvas = state.liveCanvas;
  const map = state.liveTextureMap;
  if (!textureCanvas || !liveCanvas || !map || !state.liveTicketId) return;
  const context = textureCanvas.getContext('2d');
  if (!context) return;
  const part = state.livePart;
  const x = part ? Math.round(part.x * textureCanvas.width) : 0;
  const y = part ? Math.round(part.y * textureCanvas.height) : 0;
  const width = part ? Math.round(part.w * textureCanvas.width) : textureCanvas.width;
  const height = part ? Math.round(part.h * textureCanvas.height) : textureCanvas.height;
  context.fillStyle = modelMapFallbackColor(map);
  context.fillRect(x, y, width, height);
  context.drawImage(liveCanvas, 0, 0, liveCanvas.width, liveCanvas.height, x, y, width, height);
  if (state.liveTexture) state.liveTexture.needsUpdate = true;
}

function remapGeometryUv(geometry: THREE.BufferGeometry, rect: [number, number, number, number]): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const [x, y, w, h] = rect;
  const u0 = x;
  const u1 = x + w;
  const v0 = 1 - (y + h);
  const v1 = 1 - y;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

function remapUvToIsland(geometry: THREE.BufferGeometry, island: UvIsland): void {
  remapGeometryUv(geometry, [island.x, island.y, island.w, island.h]);
}

/** Builds a mesh from a blueprint's primitive description (a file-less model). */
function buildMeshFromSpec(spec: MeshSpec): THREE.Group {
  const group = new THREE.Group();
  for (const part of spec.parts) {
    const [w, h, d] = part.size ?? [1, 1, 1];
    let geometry: THREE.BufferGeometry;
    if (part.shape === 'sphere') geometry = new THREE.SphereGeometry(Math.max(w, h, d) / 2, 32, 24);
    else if (part.shape === 'cylinder') geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
    else geometry = new THREE.BoxGeometry(w, h, d);
    remapGeometryUv(geometry, part.uv);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }),
    );
    mesh.name = part.name ?? '';
    if (part.position) mesh.position.set(part.position[0], part.position[1], part.position[2]);
    if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    group.add(mesh);
  }
  return group;
}

function buildProceduralMesh(layout: UvIsland[]): THREE.Group {
  const group = new THREE.Group();
  for (const island of layout) {
    const transform = PART_TRANSFORM[island.name.toUpperCase()];
    if (!transform) continue;
    const geometry = new THREE.BoxGeometry(transform.w, transform.h, transform.d);
    remapUvToIsland(geometry, island);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }));
    mesh.name = island.name;
    mesh.position.set(transform.x, transform.y, transform.z);
    group.add(mesh);
  }
  return group;
}

function fitObject(root: THREE.Object3D): THREE.Group {
  const wrapper = new THREE.Group();
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  root.position.set(-center.x, -center.y, -center.z);
  wrapper.add(root);
  wrapper.scale.setScalar(2 / maxDim);
  return wrapper;
}

interface ModelPreviewProps {
  scene: Scene;
  tickets: Ticket[];
  onAttachModel?: (file: File) => void;
  liveMap?: MapType;
  liveCanvas?: HTMLCanvasElement;
  liveTicketId?: string;
  livePart?: UvIsland;
  liveVersion?: number;
  paintMode?: PaintMode;
  focusPart?: string;
  showMapControls?: boolean;
  /** Called when the user clicks a part other than the one being painted. */
  onOpenPart?: (ticketId: string) => void;
}

export function ModelPreview({
  scene,
  tickets,
  onAttachModel,
  liveMap,
  liveCanvas,
  liveTicketId,
  livePart,
  liveVersion,
  paintMode,
  focusPart,
  showMapControls = true,
  onOpenPart,
}: ModelPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<PreviewState | null>(null);
  const paintModeRef = useRef(paintMode);
  paintModeRef.current = paintMode;
  const [paintCursor, setPaintCursor] = useState<{ x: number; y: number } | null>(null);
  const focusPartRef = useRef(focusPart);
  focusPartRef.current = focusPart;
  const paintPointerRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasMesh = Boolean(
    scene.modelFile?.dataUrl ||
      scene.modelFile?.url ||
      (scene.mesh && scene.mesh.parts.length > 0) ||
      (scene.uvLayout && scene.uvLayout.length > 0),
  );
  const [visibleMaps, setVisibleMaps] = useState<Set<MapType>>(() => new Set(MAP_TYPES));
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    if (!hasMesh) return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    const width = mount.clientWidth || 300;
    const height = mount.clientHeight || 240;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();
    scene3.background = new THREE.Color('#0b0d12');
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 2.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;

    scene3.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(2, 4, 3);
    scene3.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9ec5ff, 1.1);
    rimLight.position.set(-3, -1, -2);
    scene3.add(rimLight);

    // Environment so metal/roughness read correctly.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene3.environment = envTexture;
    scene3.environmentIntensity = 1.5;

    const defaultMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }),
    );
    defaultMesh.visible = false;
    scene3.add(defaultMesh);

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene3, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const observer = new ResizeObserver(() => {
      const w = mount.clientWidth || 300;
      const h = mount.clientHeight || 240;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    observer.observe(mount);

    stateRef.current = {
      renderer,
      scene3,
      camera,
      controls,
      defaultMesh,
      modelRoot: null,
      textures: [],
      standardMaterials: new Map(),
      tickets,
      sceneDimensions: scene.canvas,
      sceneTarget: scene.target,
      uvLayout: scene.uvLayout ?? [],
      flipY: true,
      token: 0,
      visibleMaps: new Set(MAP_TYPES),
      liveMap,
      liveCanvas,
      liveTicketId,
      livePart,
      liveTexture: null,
      liveTextureCanvas: null,
      liveTextureMap: undefined,
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      const state = stateRef.current;
      state?.textures.forEach((texture) => texture.dispose());
      state?.standardMaterials.forEach((mat) => mat.dispose());
      defaultMesh.geometry.dispose();
      pmrem.dispose();
      envTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMesh]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.tickets = tickets;
  }, [tickets]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const token = ++state.token;
    const isCurrent = () => stateRef.current === state && state.token === token;

    if (state.modelRoot) {
      state.scene3.remove(state.modelRoot);
      state.modelRoot = null;
    }
    state.defaultMesh.visible = false;
    state.flipY = true;
    state.sceneTarget = scene.target;
    state.uvLayout = scene.uvLayout ?? [];

    const attach = (root: THREE.Object3D, flipY: boolean) => {
      if (!isCurrent()) return;
      state.modelRoot = fitObject(root);
      state.flipY = flipY;
      state.scene3.add(state.modelRoot);
      focusModelPart(state, focusPartRef.current);
      void applyTextures(state);
    };

    const file = scene.modelFile;
    if (file?.dataUrl) {
      const loader = new GLTFLoader();
      fetch(file.dataUrl)
        .then((response) => response.arrayBuffer())
        .then((buffer) =>
          loader.parse(
            buffer,
            '',
            (gltf) => {
              gltf.scene.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
              });
              attach(gltf.scene, false);
            },
            () => undefined,
          ),
        )
        .catch(() => undefined);
    } else if (file?.url) {
      const loader = new GLTFLoader();
      loader.load(
        file.url,
        (gltf) => {
          gltf.scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
          });
          attach(gltf.scene, false);
        },
        undefined,
        () => undefined,
      );
    } else if (scene.mesh && scene.mesh.parts.length > 0) {
      attach(buildMeshFromSpec(scene.mesh), true);
    } else if (scene.uvLayout && scene.uvLayout.length > 0) {
      attach(buildProceduralMesh(scene.uvLayout), true);
    } else {
      void applyTextures(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.modelFile?.dataUrl, scene.modelFile?.url, scene.mesh, scene.uvLayout, hasMesh]);

  useEffect(() => {
    const state = stateRef.current;
    if (state) focusModelPart(state, focusPart);
  }, [focusPart]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.visibleMaps = visibleMaps;
    void applyTextures(state);
  }, [visibleMaps]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.liveMap = liveMap;
    state.liveCanvas = liveCanvas;
    state.liveTicketId = liveTicketId;
    state.livePart = livePart;
    void applyTextures(state);
  }, [liveMap, liveCanvas, liveTicketId, livePart, tickets]);

  useEffect(() => {
    const state = stateRef.current;
    if (state) updateLiveTexture(state);
  }, [liveVersion]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.controls.enabled = !paintMode;
    const canvas = state.renderer.domElement;
    canvas.style.cursor = paintMode ? 'crosshair' : '';
    return () => {
      state.controls.enabled = true;
      canvas.style.cursor = '';
    };
  }, [Boolean(paintMode)]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.controls.autoRotate = autoRotate;
    state.controls.autoRotateSpeed = 1.6;
  }, [autoRotate]);

  const resetView = () => {
    const state = stateRef.current;
    if (!state) return;
    focusModelPart(state, focusPart);
  };
  const availableMaps = MAP_TYPES.filter((map) =>
    tickets.some((ticket) =>
      ticket.materialChannels?.length
        ? ticket.materialChannels.some((channel) => channel.map === map)
        : ticket.mapType === map,
    ),
  );

  const paintHit = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state?.modelRoot) return null;
    const rect = state.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, state.camera);
    const hit = raycaster
      .intersectObject(state.modelRoot, true)
      .find((intersection) => intersection.uv && intersection.object.visible);
    return hit?.uv ? { u: hit.uv.x, v: hit.uv.y } : null;
  };

  const handlePaintDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const paint = paintModeRef.current;
    if (!paint) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    setPaintCursor({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const uv = paintHit(event);
    if (!uv) return;
    // Clicking a different body part switches to that part's ticket instead of painting.
    if (paint.partName) {
      const state = stateRef.current;
      const island = state?.uvLayout.find(
        (entry) =>
          uv.u >= entry.x && uv.u <= entry.x + entry.w && 1 - uv.v >= entry.y && 1 - uv.v <= entry.y + entry.h,
      );
      if (island && island.name !== paint.partName) {
        const target = state?.tickets.find((ticket) => ticket.modelPart?.name === island.name);
        if (target && onOpenPart) {
          onOpenPart(target.id);
          return;
        }
      }
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    paintPointerRef.current = true;
    paint.onStart(uv);
    const state = stateRef.current;
    const texture = state?.liveTexture;
    if (texture) texture.needsUpdate = true;
    else if (state) void applyTextures(state);
  };

  const handlePaintMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paintModeRef.current) {
      const bounds = event.currentTarget.getBoundingClientRect();
      setPaintCursor({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    if (!paintPointerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const uv = paintHit(event);
    if (uv) {
      paintModeRef.current?.onMove(uv);
      const state = stateRef.current;
      const texture = state?.liveTexture;
      if (texture) texture.needsUpdate = true;
      else if (state) void applyTextures(state);
    }
  };

  const handlePaintUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!paintPointerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    paintPointerRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    paintModeRef.current?.onEnd();
  };

  if (!hasMesh) {
    return (
      <div className="model-preview model-preview-empty">
        <Icon name="cube" size={26} />
        <p>{t('model.noModelPrompt')}</p>
        {onAttachModel ? (
          <button className="ghost-button small" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={14} /> {t('model.modelUpload')}
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf,.fbx,.obj,model/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onAttachModel?.(chosen);
            event.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div className="model-preview-wrap">
      <div className="model-preview-bar">
        <span className="model-preview-spacer" />
        <button className="icon-button tight" title={t('model.resetView')} aria-label={t('model.resetView')} onClick={resetView}>
          <Icon name="fit" size={13} />
        </button>
        <button
          className={`icon-button tight ${autoRotate ? 'active' : ''}`}
          title={t('model.autoRotate')}
          aria-label={t('model.autoRotate')}
          onClick={() => setAutoRotate((value) => !value)}
        >
          <Icon name="reset" size={13} />
        </button>
      </div>
      <div
        className={`model-preview ${paintMode ? 'painting' : ''}`}
        data-paint-ticket={paintMode?.ticketId}
        aria-label={paintMode ? t('material.3dModel') : undefined}
        ref={mountRef}
        onPointerLeave={() => {
          if (!paintPointerRef.current) setPaintCursor(null);
        }}
        onPointerDownCapture={handlePaintDown}
        onPointerMoveCapture={handlePaintMove}
        onPointerUpCapture={handlePaintUp}
        onPointerCancelCapture={handlePaintUp}
        onLostPointerCapture={handlePaintUp}
      >
        {paintMode ? (
          <>
            <span className="model-paint-indicator">
              {t('material.paintingOnModel', { part: paintMode.partName ?? t('material.wholeModel') })}
            </span>
            {paintCursor ? (
              <span
                className="model-paint-cursor"
                aria-hidden="true"
                style={{
                  left: paintCursor.x,
                  top: paintCursor.y,
                  width: Math.max(14, Math.min(40, paintMode.settings.size * 2 + 8)),
                  height: Math.max(14, Math.min(40, paintMode.settings.size * 2 + 8)),
                  borderColor: paintMode.settings.color,
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {showMapControls && availableMaps.length > 0 ? (
        <section className="model-map-controls" aria-label={t('model.visibleMaps')}>
          <h4>{t('model.visibleMaps')}</h4>
          <div className="model-map-toggle-list">
            {availableMaps.map((map) => (
              <label key={map} className="model-map-toggle">
                <input
                  type="checkbox"
                  checked={visibleMaps.has(map)}
                  onChange={() =>
                    setVisibleMaps((current) => {
                      const next = new Set(current);
                      if (next.has(map)) next.delete(map);
                      else next.add(map);
                      return next;
                    })
                  }
                />
                <span>{t(`map.${map}` as const)}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

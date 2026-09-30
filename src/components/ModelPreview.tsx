import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MapType, MeshSpec, Scene, Ticket, UvIsland } from '../types';
import { composeTicketCanvas } from '../drawing/compose';
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
  basicMaterials: THREE.Material[];
  standardMaterials: Map<THREE.Mesh, THREE.MeshStandardMaterial>;
  tickets: Ticket[];
  flipY: boolean;
  token: number;
  viewMode: 'full' | MapType;
}

export type PreviewViewMode = 'full' | MapType;

const VIEW_MODES: PreviewViewMode[] = ['full', 'basecolor', 'normal', 'roughness', 'metallic', 'ao'];

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
  state.basicMaterials.forEach((material) => material.dispose());
  state.basicMaterials = [];

  const byMap: Partial<Record<MapType, THREE.Texture>> = {};
  for (const ticket of state.tickets) {
    if (!ticket.mapType) continue;
    const canvas = await composeTicketCanvas(ticket);
    if (!canvasHasContent(canvas)) continue;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace =
      ticket.mapType === 'basecolor' || ticket.mapType === 'emissive'
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
    texture.flipY = state.flipY;
    texture.needsUpdate = true;
    byMap[ticket.mapType] = texture;
    state.textures.push(texture);
  }

  const meshes: THREE.Mesh[] = [];
  if (state.modelRoot) {
    state.modelRoot.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
  } else {
    meshes.push(state.defaultMesh);
  }

  const mode = state.viewMode;
  state.renderer.toneMapping = mode === 'full' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;

  for (const mesh of meshes) {
    if (!state.standardMaterials.has(mesh)) {
      state.standardMaterials.set(
        mesh,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0 }),
      );
    }
    if (mode === 'full') {
      const material = state.standardMaterials.get(mesh)!;
      material.map = byMap.basecolor ?? null;
      material.normalMap = byMap.normal ?? null;
      material.roughnessMap = byMap.roughness ?? null;
      material.metalnessMap = byMap.metallic ?? null;
      material.aoMap = byMap.ao ?? null;
      material.emissiveMap = byMap.emissive ?? null;
      material.emissive = new THREE.Color(byMap.emissive ? 0xffffff : 0x000000);
      material.metalness = byMap.metallic ? 1 : 0;
      material.roughness = byMap.roughness ? 1 : 0.65;
      if (byMap.ao && mesh.geometry.attributes.uv && !mesh.geometry.attributes.uv2) {
        mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
      }
      material.needsUpdate = true;
      mesh.material = material;
    } else {
      const material = new THREE.MeshBasicMaterial({ map: byMap[mode] ?? null });
      state.basicMaterials.push(material);
      mesh.material = material;
    }
  }
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
}

export function ModelPreview({ scene, tickets, onAttachModel }: ModelPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<PreviewState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasMesh = Boolean(
    scene.modelFile?.dataUrl ||
      scene.modelFile?.url ||
      (scene.mesh && scene.mesh.parts.length > 0) ||
      (scene.uvLayout && scene.uvLayout.length > 0),
  );
  const [viewMode, setViewMode] = useState<PreviewViewMode>('full');
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
      basicMaterials: [],
      standardMaterials: new Map(),
      tickets,
      flipY: true,
      token: 0,
      viewMode: 'full',
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      const state = stateRef.current;
      state?.textures.forEach((texture) => texture.dispose());
      state?.basicMaterials.forEach((mat) => mat.dispose());
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
    void applyTextures(state);
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

    const attach = (root: THREE.Object3D, flipY: boolean) => {
      if (!isCurrent()) return;
      state.modelRoot = fitObject(root);
      state.flipY = flipY;
      state.scene3.add(state.modelRoot);
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
    if (!state) return;
    state.viewMode = viewMode;
    void applyTextures(state);
  }, [viewMode]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.controls.autoRotate = autoRotate;
    state.controls.autoRotateSpeed = 1.6;
  }, [autoRotate]);

  const resetView = () => {
    const state = stateRef.current;
    if (!state) return;
    state.camera.position.set(0, 0.5, 2.9);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
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
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            className={`chip tiny ${viewMode === mode ? 'active' : ''}`}
            onClick={() => setViewMode(mode)}
          >
            {mode === 'full' ? t('model.viewFull') : t(`map.${mode}` as const)}
          </button>
        ))}
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
      <div className="model-preview" ref={mountRef} />
    </div>
  );
}

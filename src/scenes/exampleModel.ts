import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mesh, MeshStandardMaterial } from 'three';
import type { SceneBlueprint } from '../types';

export interface ExampleModel {
  id: string;
  name: string;
  url: string;
  license: string;
  credit: string;
}

/**
 * Ready-to-use, clearly-licensed models from the Khronos glTF Sample Assets,
 * bundled locally in `public/models/` (no CORS/offline issues).
 */
export const EXAMPLE_MODELS: ExampleModel[] = [
  {
    id: 'cesium-man',
    name: 'CesiumMan',
    url: '/models/CesiumMan.glb',
    license: 'CC-BY 4.0',
    credit: '© 2017 Cesium — Khronos glTF Sample Assets',
  },
];

export function getExampleModelBlueprint(model: ExampleModel): SceneBlueprint {
  return {
    schemaVersion: 3,
    id: `example-${model.id}`,
    action: 'upsert',
    kind: 'model',
    name: `Beispiel: ${model.name}`,
    description: `Fertiges Beispielmodell aus den Khronos glTF-Sample-Assets (${model.license}). Male die Textur direkt in der App und sieh das Ergebnis live am Modell.`,
    artDirection: 'Übernommenes Modell — zum Testen von Texturmalen, 3D-Vorschau und Export.',
    target: 'gltf',
    canvas: { width: 2048, height: 2048, background: '#0b0d12' },
    modelUrl: model.url,
    maps: [
      {
        id: 'example-basecolor',
        map: 'basecolor',
        brief: 'Die Basisfarbtextur des Modells. Das Original liegt als Startpunkt vor — male darüber und beobachte die 3D-Vorschau.',
      },
    ],
  };
}

/** Loads a .glb and returns its base colour texture as a PNG data URL. */
export async function extractModelBaseColor(url: string): Promise<string> {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        let result = '';
        gltf.scene.traverse((object) => {
          if (result) return;
          const mesh = object as Mesh;
          const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
            | MeshStandardMaterial
            | undefined;
          const image = material?.map?.image as
            | (CanvasImageSource & { width?: number; height?: number })
            | undefined;
          if (image && image.width && image.height) {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(image, 0, 0);
              result = canvas.toDataURL('image/png');
            }
          }
        });
        resolve(result);
      },
      undefined,
      () => resolve(''),
    );
  });
}

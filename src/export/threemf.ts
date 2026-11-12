import type { BuiltPart } from '../domain/types';
import { strToU8, zipSync } from 'fflate';

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function encode3MF(parts: BuiltPart[]): Uint8Array {
  const objects = parts
    .map((part, index) => {
      const id = index + 1;
      const vertices: string[] = [];
      const p = part.positions;
      for (let i = 0; i < p.length; i += 3) {
        vertices.push(`<vertex x="${p[i].toFixed(4)}" y="${p[i + 1].toFixed(4)}" z="${p[i + 2].toFixed(4)}" />`);
      }
      const triangles: string[] = [];
      const idx = part.indices;
      for (let i = 0; i < idx.length; i += 3) {
        triangles.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}" />`);
      }
      return `<object id="${id}" type="model" name="${xmlEscape(part.name)}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
    })
    .join('');
  const items = parts.map((_, index) => `<item objectid="${index + 1}" />`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Nenocutter</metadata>
  <metadata name="Title">Nenocutter design</metadata>
  <resources>${objects}</resources>
  <build>${items}</build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  );
}

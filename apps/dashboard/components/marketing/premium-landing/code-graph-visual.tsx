'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { cn } from '@/components/ui/utils';

type LabelNode = {
  color: string;
  text: string;
  position: THREE.Vector3;
};

type CodeGraphVisualProps = {
  className?: string;
  compact?: boolean;
  monoClassName?: string;
};

const labelPalette = [
  { text: 'auth system', color: '#f783a3' },
  { text: 'user service', color: '#f783a3' },
  { text: 'remote_api_call()', color: '#f24e1e' },
  { text: 'resolvePathAlias()', color: '#f24e1e' },
  { text: 'mergeObjectProps()', color: '#f24e1e' },
  { text: 'session_token_expiry()', color: '#f24e1e' },
  { text: 'client_side_render()', color: '#f24e1e' },
  { text: 'cloneStateSnapshot()', color: '#f24e1e' },
];

export function CodeGraphVisual({
  className,
  compact = false,
  monoClassName,
}: CodeGraphVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(0, 0, compact ? 9 : 8);

    const group = new THREE.Group();
    scene.add(group);

    const nodeCount = compact ? 54 : 86;
    const radius = compact ? 2.4 : 3.1;
    const nodes: THREE.Vector3[] = [];

    for (let index = 0; index < nodeCount; index += 1) {
      const phi = Math.acos(1 - (2 * (index + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5);
      const point = new THREE.Vector3(
        Math.cos(theta) * Math.sin(phi),
        Math.sin(theta) * Math.sin(phi),
        Math.cos(phi),
      ).multiplyScalar(radius + Math.sin(index * 1.7) * 0.22);
      nodes.push(point);
    }

    const positions = new Float32Array(nodeCount * 3);
    const colors = new Float32Array(nodeCount * 3);

    nodes.forEach((node, index) => {
      positions[index * 3] = node.x;
      positions[index * 3 + 1] = node.y;
      positions[index * 3 + 2] = node.z;

      const swatch = ['#7dd3fc', '#34d399', '#fbbf24', '#fb7185'][index % 4];
      const color = new THREE.Color(swatch);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const points = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        size: compact ? 0.08 : 0.095,
        transparent: true,
        opacity: 0.92,
        vertexColors: true,
      }),
    );
    group.add(points);

    const lineVertices: number[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const distance = nodes[i].distanceTo(nodes[j]);
        if (distance < (compact ? 1.08 : 1.16)) {
          lineVertices.push(
            nodes[i].x,
            nodes[i].y,
            nodes[i].z,
            nodes[j].x,
            nodes[j].y,
            nodes[j].z,
          );
        }
      }
    }

    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(lineVertices, 3),
      ),
      new THREE.LineBasicMaterial({
        color: '#d4d4d8',
        transparent: true,
        opacity: compact ? 0.22 : 0.18,
      }),
    );
    group.add(lines);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.02, 24, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: compact ? 0.025 : 0.04,
        wireframe: true,
      }),
    );
    group.add(halo);

    const labelNodes: LabelNode[] = labelPalette.map((item, index) => ({
      ...item,
      position: nodes[(index * 11 + 7) % nodes.length].clone().multiplyScalar(1.08),
    }));

    labelNodes.forEach((label) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(compact ? 0.095 : 0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: label.color }),
      );
      mesh.position.copy(label.position);
      group.add(mesh);
    });

    const size = { width: 0, height: 0 };
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      size.width = bounds.width;
      size.height = bounds.height;
      camera.aspect = bounds.width / Math.max(bounds.height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
    };

    resize();
    window.addEventListener('resize', resize);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.35;
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.35;
    };

    container.addEventListener('pointermove', onPointerMove);
    const onPointerDown = () => {
      container.style.cursor = 'grabbing';
    };
    const onPointerUp = () => {
      container.style.cursor = 'grab';
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerUp);

    const timer = new THREE.Timer();
    let frameId = 0;

    const animate = (timestamp: number) => {
      timer.update(timestamp);
      const elapsed = timer.getElapsed();
      group.rotation.y = elapsed * 0.14 + pointer.x;
      group.rotation.x = Math.sin(elapsed * 0.35) * 0.14 + pointer.y;
      halo.rotation.y = elapsed * 0.18;
      halo.rotation.x = elapsed * 0.12;

      renderer.render(scene, camera);

      group.updateMatrixWorld(true);
      labelNodes.forEach((label, index) => {
        const element = labelRefs.current[index];
        if (!element) {
          return;
        }

        const world = label.position.clone().applyMatrix4(group.matrixWorld);
        const projected = world.project(camera);
        const x = (projected.x * 0.5 + 0.5) * size.width;
        const y = (-projected.y * 0.5 + 0.5) * size.height;
        const opacity = THREE.MathUtils.clamp(1.25 - projected.z * 0.45, 0, 1);
        const scale = THREE.MathUtils.clamp(1.05 - projected.z * 0.08, 0.82, 1.18);

        element.style.opacity = opacity > 0.18 ? opacity.toFixed(2) : '0';
        element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
      });

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerleave', onPointerUp);
      renderer.dispose();
      pointsGeometry.dispose();
      (points.material as THREE.Material).dispose();
      (lines.geometry as THREE.BufferGeometry).dispose();
      (lines.material as THREE.Material).dispose();
      (halo.geometry as THREE.BufferGeometry).dispose();
      (halo.material as THREE.Material).dispose();
      scene.clear();
    };
  }, [compact]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-[350px] w-full items-center justify-center overflow-x-visible',
        'lg:h-[450px]',
        compact && 'h-[300px] lg:h-[360px]',
        className,
      )}
    >
      <div className="absolute h-full min-h-[500px] w-full translate-x-[-50%] translate-y-[-50%] cursor-grab rounded-[28px] border border-white/10 bg-[#06070b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] [left:50%] [top:50%]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(45,212,191,0.16),transparent_32%),radial-gradient(circle_at_80%_24%,rgba(244,114,182,0.16),transparent_26%),radial-gradient(circle_at_18%_82%,rgba(249,115,22,0.12),transparent_22%)]" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      </div>
      <div className="pointer-events-none absolute inset-0 h-full min-h-[500px]">
        {labelPalette.map((label, index) => (
          <div
            key={label.text}
            ref={(node) => {
              labelRefs.current[index] = node;
            }}
            className={cn(
              'absolute left-0 top-0 whitespace-nowrap rounded-none px-[3px] py-[1px] text-[9px] font-medium tracking-[-0.02em] text-white shadow-[0_0_8px_rgba(0,0,0,0.25)]',
              monoClassName,
            )}
            style={{
              backgroundColor: label.color,
              boxShadow: `0 0 8px ${label.color}33`,
              opacity: 0,
            }}
          >
            {label.text}
          </div>
        ))}
      </div>
    </div>
  );
}

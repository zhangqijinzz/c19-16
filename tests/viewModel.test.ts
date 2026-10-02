import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

const tinyDocument = (): LayoutDocument => ({
  version: 1,
  title: '紧凑场地',
  field: { width: 6, height: 5 },
  elements: [{ id: 'booth-0', kind: 'booth', name: '已有展位', x: 0.5, y: 0.5, width: 5, height: 3.5, rotation: 0 }],
});

describe('ExpoSketchViewModel', () => {
  it('initializes and updates the selected layout', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count + 1);
    expect(vm.state.selectedId).toContain('booth-');
  });

  it('updates analysis immediately after moving an element into an overlap', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('recovers the example if repository loading fails', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => { throw new Error('bad storage'); }), save: vi.fn(async () => {}) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.document.title).toContain('春日创意市集');
  });

  it('shows a save error without dropping the working document', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => createStarterDocument()), save: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.addElement('stage');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vm.state.document.elements.some((element) => element.kind === 'stage' && element.id.startsWith('stage-'))).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });

  it('ignores invalid dimensions instead of corrupting the working selection', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.document.elements[0].width;
    vm.resizeSelected(0, 0);
    expect(vm.state.document.elements[0].width).toBe(before);
  });

  it('places repeated additions into free spots without creating overlap records', () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    const startOverlaps = vm.state.analysis.overlaps.length;
    vm.addElement('booth');
    vm.addElement('booth');
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(8);
    expect(vm.state.analysis.overlaps).toHaveLength(startOverlaps);
    expect(vm.state.notice.tone).toBe('success');
    expect(vm.state.justAddedId).toBe(vm.state.selectedId);
  });

  it('rejects an addition that cannot fit without stacking it onto others', async () => {
    const initial = tinyDocument();
    const save = vi.fn(async () => {});
    const vm = new ExpoSketchViewModel({ load: vi.fn(async () => initial), save });
    await vm.initialize();
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count);
    expect(vm.state.analysis.overlaps).toHaveLength(0);
    expect(vm.state.notice.tone).toBe('error');
    expect(vm.state.notice.message).toContain('扩大场地');
    expect(save).not.toHaveBeenCalled();
  });
});

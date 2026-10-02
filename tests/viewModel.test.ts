import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
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

  it('places several added booths without stacking them onto one another', () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    const startCount = vm.state.document.elements.length;
    for (let i = 0; i < 4; i += 1) vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(startCount + 4);
    expect(vm.state.analysis.overlaps).toHaveLength(0);
    // 每加一个都会选中新元素，并记录为最后加入，方便用户一眼看到
    expect(vm.state.selectedId).toBe(vm.state.document.elements[vm.state.document.elements.length - 1].id);
    expect(vm.state.lastAddedId).toBe(vm.state.selectedId);
  });

  it('refuses to add when the field is full and tells the user what to do', async () => {
    const document = createStarterDocument();
    document.field = { width: 12, height: 10 };
    document.elements = [
      { id: 'a', kind: 'booth', name: 'a', x: 0.5, y: 0.5, width: 5, height: 3.5, rotation: 0 },
      { id: 'b', kind: 'booth', name: 'b', x: 6.5, y: 0.5, width: 5, height: 3.5, rotation: 0 },
      { id: 'c', kind: 'booth', name: 'c', x: 0.5, y: 5, width: 5, height: 3.5, rotation: 0 },
      { id: 'd', kind: 'booth', name: 'd', x: 6.5, y: 5, width: 5, height: 3.5, rotation: 0 },
    ];
    const save = vi.fn(async () => {});
    const vm = new ExpoSketchViewModel({ load: vi.fn(async () => document), save });
    await vm.initialize();
    const countBefore = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(countBefore);
    expect(vm.state.analysis.overlaps).toHaveLength(0);
    expect(vm.state.notice.tone).toBe('warning');
    expect(vm.state.notice.message).toContain('场地');
    expect(save).not.toHaveBeenCalled();
  });
});

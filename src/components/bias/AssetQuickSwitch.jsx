import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CheckCircle2, GripHorizontal } from 'lucide-react';
import MarketIcon from './MarketIcon';
import {
  orderAnalyses,
  saveInstrumentOrder,
  hasSeenReorderHint,
  markReorderHintSeen,
} from '@/lib/instrumentOrder';

// How long the pill must be held still before it "lifts" into reorder mode.
// Long enough not to fire during a horizontal scroll flick, short enough to
// feel responsive — the same ballpark as rearranging apps on a phone.
const LONG_PRESS_MS = 300;
// If the finger travels further than this before the hold completes, the user
// is scrolling the row, not reordering — abandon the long-press so the native
// horizontal scroll takes over untouched.
const MOVE_CANCEL_PX = 8;

function triggerHaptic() {
  // Best-effort — silently a no-op where the device/browser doesn't support it
  // (e.g. iOS Safari), which is exactly the "where supported" the spec calls for.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  } catch {
    /* haptics unsupported — ignore */
  }
}

const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// One draggable favourite pill. Drag is manually gated behind a long-press
// (dragListener={false} + our own timer → dragControls.start) so a plain tap
// still selects the instrument and a horizontal swipe still scrolls the row.
function ReorderablePill({ analysis, isActive, reordering, onSelect, onReorderStart, interactionRef }) {
  const controls = useDragControls();
  const longPressTimer = useRef(null);
  const downEventRef = useRef(null);
  const pointerStart = useRef(null);
  const enteredReorder = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const handlePointerDown = (e) => {
    // Ignore secondary mouse buttons; touch/pen/left-click only.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    downEventRef.current = e.nativeEvent;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    enteredReorder.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      enteredReorder.current = true;
      onReorderStart();
      // Hand the in-progress press to framer to begin the drag from here.
      controls.start(downEventRef.current);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e) => {
    if (enteredReorder.current || !pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      // Movement before the hold completes = a scroll gesture. Bail out.
      clearLongPress();
    }
  };

  const endPress = () => {
    clearLongPress();
    pointerStart.current = null;
  };

  const handleClick = (e) => {
    // Swallow the click that trails a drag or a long-press activation so it
    // never gets mistaken for a tap-to-select.
    if (
      reordering ||
      enteredReorder.current ||
      (interactionRef.current && performance.now() < interactionRef.current.suppressClickUntil)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect();
  };

  const { instrument, results } = analysis;
  const isTradeReady = ['TRADE', 'BUY', 'SELL'].includes(results?.tradeAction);
  const isIncomplete = !results || !results.mainDirection;

  return (
    <Reorder.Item
      as="div"
      value={instrument}
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.06,
        zIndex: 50,
        boxShadow: '0 12px 24px -8px rgba(0,0,0,0.45)',
        cursor: 'grabbing',
      }}
      className="shrink-0"
      style={{ touchAction: reordering ? 'none' : 'auto' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        data-active={isActive}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onClick={handleClick}
        className={cn(
          'relative flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-[13px] border transition-colors whitespace-nowrap select-none w-full',
          isActive
            ? 'border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_-6px_rgba(20,184,166,0.35)]'
            : 'bg-card border-border/70 shadow-sm hover:border-primary/40',
          reordering && 'cursor-grab'
        )}
      >
        {/* Monochrome supporting icon — inherits the pill's colour */}
        <span
          className={cn(
            'grid place-items-center w-[22px] h-[22px] rounded-[7px]',
            isActive ? 'bg-white/20 text-white' : 'bg-foreground/[0.05] text-foreground/60'
          )}
        >
          <MarketIcon instrument={instrument} />
        </span>

        <span className="text-sm font-semibold">{instrument}</span>

        {/* Status indicators — hidden during reorder so the row reads as "handles" */}
        {!reordering && isTradeReady && (
          <CheckCircle2 className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-primary')} />
        )}

        {!reordering && isIncomplete && (
          <div className={cn('w-2 h-2 rounded-full', isActive ? 'bg-primary-foreground/50' : 'bg-yellow-400')} />
        )}

        {/* Grip affordance while reordering — reinforces "these can be moved" */}
        {reordering && (
          <GripHorizontal className={cn('w-3.5 h-3.5', isActive ? 'text-white/70' : 'text-muted-foreground/60')} />
        )}
      </button>
    </Reorder.Item>
  );
}

export default function AssetQuickSwitch({ analyses, currentInstrument, onInstrumentChange }) {
  const scrollContainerRef = useRef(null);

  // Local, reorderable list of instrument symbols. Seeded from the saved order
  // so a custom arrangement survives reloads; framer drives it live during a drag.
  const [order, setOrder] = useState(() => orderAnalyses(analyses).map((a) => a.instrument));
  const [reordering, setReordering] = useState(false);
  const [hintSeen, setHintSeen] = useState(hasSeenReorderHint);

  const orderRef = useRef(order);
  const hintSeenRef = useRef(hintSeen);
  const dragStartOrderRef = useRef(null);
  // Shared window during which a trailing click must be ignored (post-drag).
  const interactionRef = useRef({ suppressClickUntil: 0 });

  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { hintSeenRef.current = hintSeen; }, [hintSeen]);

  // Reconcile the local order whenever the set of active instruments changes
  // (an asset added, removed or completed) without disturbing the user's
  // arrangement: keep known instruments in place, drop gone ones, append new.
  const instrumentKey = analyses.map((a) => a.instrument).join('');
  useEffect(() => {
    const incoming = analyses.map((a) => a.instrument);
    setOrder((prev) => {
      const kept = prev.filter((inst) => incoming.includes(inst));
      const added = incoming.filter((inst) => !kept.includes(inst));
      const next = [...kept, ...added];
      return sameOrder(next, prev) ? prev : next;
    });

  }, [instrumentKey]);

  // Auto-scroll to the active pill when it changes (unless mid-reorder).
  useEffect(() => {
    if (reordering) return;
    const activeTab = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentInstrument, reordering]);

  const handleReorder = useCallback((next) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const onReorderStart = useCallback(() => {
    dragStartOrderRef.current = orderRef.current;
    triggerHaptic();
    setReordering(true);
  }, []);

  // Finalise the gesture on release. Driven from a window-level pointerup so it
  // fires reliably even when the finger lifts off a different pill — and even
  // when the drop was a no-op (framer's onDragEnd doesn't fire without movement).
  const finalize = useCallback(() => {
    interactionRef.current.suppressClickUntil = performance.now() + 150;
    const start = dragStartOrderRef.current;
    const curr = orderRef.current;
    if (start && !sameOrder(start, curr)) {
      saveInstrumentOrder(curr);
      // Release = save. Once they've done it once, retire the hint for good.
      if (!hintSeenRef.current) {
        markReorderHintSeen();
        setHintSeen(true);
      }
    }
    dragStartOrderRef.current = null;
    setReordering(false);
  }, []);

  useEffect(() => {
    if (!reordering) return undefined;
    const onUp = () => finalize();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [reordering, finalize]);

  if (!analyses || analyses.length === 0) return null;

  const byInstrument = new Map(analyses.map((a) => [a.instrument, a]));
  const items = order.filter((inst) => byInstrument.has(inst));
  const showHint = !hintSeen && items.length >= 2;

  return (
    <div className="relative">
      <div ref={scrollContainerRef} className="overflow-x-auto scrollbar-hide">
        <Reorder.Group
          as="div"
          axis="x"
          values={items}
          onReorder={handleReorder}
          className="flex gap-2 pt-0.5 pb-2 min-w-min"
        >
          {items.map((inst) => (
            <ReorderablePill
              key={inst}
              analysis={byInstrument.get(inst)}
              isActive={inst === currentInstrument}
              reordering={reordering}
              onSelect={() => onInstrumentChange(inst)}
              onReorderStart={onReorderStart}
              interactionRef={interactionRef}
            />
          ))}
        </Reorder.Group>
      </div>

      {/* Subtle right-edge fade — hints there are more markets to scroll to.
          Suppressed while reordering so it doesn't clip the lifted pill. */}
      {!reordering && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent" />
      )}

      {/* One-time discovery hint, or the live "release to save" cue mid-drag. */}
      {reordering ? (
        <div className="flex items-center gap-1.5 px-1 -mt-1 text-[11px] text-primary font-medium">
          <GripHorizontal className="w-3 h-3" />
          <span>Drag to reorder — release to save</span>
        </div>
      ) : showHint ? (
        <div className="flex items-center gap-1.5 px-1 -mt-1 text-[11px] text-muted-foreground">
          <GripHorizontal className="w-3 h-3 opacity-70" />
          <span>Long press and drag to reorder favourites.</span>
        </div>
      ) : null}
    </div>
  );
}

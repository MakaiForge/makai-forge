# Conflict Resolution System

## Overview

This document describes the conflict detection and resolution system for the Makai Forge Mod Manager. The system allows users to identify, visualize, and resolve mod conflicts before installation.

---

## Goals

1. **Detect conflicts** between mods (file overlaps)
2. **Visualize conflicts** with clear UI indicators
3. **Resolve conflicts** by allowing users to deselect conflicting mods
4. **Install selected mods** with a single action

---

## Terminology

| Term | Definition |
|------|------------|
| **Conflict** | Two or more mods that contain the same file (same path) |
| **Conflicting Mod** | A mod that has files overlapping with another mod |
| **Winner** | The mod with higher priority that "wins" the file |
| **Priority** | Numeric value determining which mod's file is used (higher = wins) |
| **Deselect** | Mark a mod as disabled for installation |

---

## Components

### 1. Conflict Detection Service

**File:** `services/mod-conflict-service.ts`

**Responsibility:**
- Load mod inventories from storage
- Build file-owner map
- Detect overlapping files
- Classify conflicts (plugin, script, asset)

**Interface:**

```typescript
interface FileConflict {
  relativePath: string;
  mods: { name: string; priority: number }[];
  winner: string;
  type: "asset" | "plugin" | "script";
}

interface ConflictEntry {
  file: string;
  mods: { name: string; priority: number }[];
  winner: string;
  type: "asset" | "plugin" | "script";
}
```

---

### 2. Conflict Badge Hook

**File:** `ui/hooks/mods/useConflictBadges.ts`

**Responsibility:**
- Detect plugin-level conflicts in real-time
- Provide conflict set and details for UI rendering

**Current Limitation:** Only detects plugin name collisions (`.esp`, `.esm`, `.esl`).

**Enhancement Needed:** Expand to detect asset and script conflicts.

---

### 3. Conflict Details Modal

**File:** `ui/components/Modals/ConflictDetailsModal/ConflictDetailsModal.tsx` (NEW)

**Responsibility:**
- Display detailed conflict information
- Allow users to deselect conflicting mods
- Apply resolution actions

**Props:**

```typescript
interface ConflictDetailsModalProps {
  open: boolean;
  modName: string;
  conflicts: ConflictEntry[];
  onApply: (deselectedMods: string[]) => void;
  onClose: () => void;
}
```

---

### 4. Mod Row with Pulse Animation

**File:** `ui/components/ModListPanel/components/ModRow/ModRow.tsx`

**Enhancement:**
- Add CSS class `mod-row--conflict-pulse` for blinking red animation
- Make the conflict badge clickable to open ConflictDetailsModal

---

### 5. Install All Selected Button

**File:** `ui/components/ModManagerTopBar/ModManagerTopBar.tsx`

**Enhancement:**
- Add "Install All Selected" button
- Count of selected mods
- Confirmation dialog before batch install

---

## User Flow

### Flow 1: Detect and Resolve Conflicts

```
1. User installs multiple mods
2. System detects conflicts (file overlaps)
3. Conflicting mods show:
   - Red pulsing background animation
   - Red "!" badge (clickable)
4. User clicks "!" badge on a mod
5. ConflictDetailsModal opens:
   ┌─────────────────────────────────────────────────┐
   │  ⚠️ Conflict Details: Bijin Warmaidens    [X]  │
   ├─────────────────────────────────────────────────┤
   │  File: meshes/.../Aela/femalehead.nif          │
   │  ☑️ Bijin Warmaidens (priority: 5) ← Winner   │
   │  ☐ CBBE Body (priority: 3)                     │
   │                                                 │
   │  File: textures/.../Aela/femalehead.dds        │
   │  ☑️ Bijin Warmaidens (priority: 5) ← Winner   │
   │  ☐ True Storms (priority: 2)                   │
   ├─────────────────────────────────────────────────┤
   │  [Apply] [Cancel]                               │
   └─────────────────────────────────────────────────┘
6. User deselects conflicting mods (unchecks checkboxes)
7. User clicks "Apply"
8. Deselected mods are marked as disabled in modlist
9. Red pulsing animation stops on resolved mods
```

### Flow 2: Install All Selected Mods

```
1. User selects multiple mods (checkboxes enabled)
2. "Install All Selected (N)" button shows count
3. User clicks button
4. Confirmation dialog:
   ┌─────────────────────────────────────────────────┐
   │  Install 5 mods?                               │
   ├─────────────────────────────────────────────────┤
   │  The following mods will be installed:         │
   │  - Bijin Warmaidens                            │
   │  - SG Hair Pack                                │
   │  - True Storms                                 │
   │  - ...                                         │
   │                                                 │
   │  [Install] [Cancel]                             │
   └─────────────────────────────────────────────────┘
5. System installs each mod sequentially
6. Progress overlay shows installation status
7. Summary dialog shows results
```

---

## Visual Design

### Conflict Pulse Animation

```scss
.mod-row--conflict-pulse {
  animation: conflict-pulse 2s ease-in-out infinite;
  background: rgba(255, 60, 60, 0.1);
}

@keyframes conflict-pulse {
  0%, 100% { background: rgba(255, 60, 60, 0.1); }
  50% { background: rgba(255, 60, 60, 0.25); }
}

.mod-row__badge--clickable {
  cursor: pointer;
  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 8px rgba(255, 60, 60, 0.6);
  }
}
```

### Conflict Details Modal

```scss
.conflict-details-modal {
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.conflict-details-modal__file {
  font-family: monospace;
  font-size: 12px;
  color: #888;
  margin: 8px 0 4px;
}

.conflict-details-modal__mod-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.conflict-details-modal__checkbox {
  width: 16px;
  height: 16px;
}

.conflict-details-modal__winner {
  color: #4caf50;
  font-size: 11px;
  font-weight: 600;
}
```

---

## Implementation Checklist

### Phase 1: Enhanced Conflict Detection
- [ ] Expand `useConflictBadges` to detect asset conflicts
- [ ] Expand `useConflictBadges` to detect script conflicts
- [ ] Return full `ConflictEntry[]` with winner info

### Phase 2: Conflict Details Modal
- [ ] Create `ConflictDetailsModal` component
- [ ] Show file path, mods, priority, winner
- [ ] Checkboxes to deselect mods
- [ ] "Apply" button to resolve conflicts
- [ ] "Cancel" button to close without changes

### Phase 3: Visual Enhancements
- [ ] Add red pulsing animation to conflicting mods
- [ ] Make conflict badge clickable
- [ ] Add tooltip showing conflict count

### Phase 4: Install All Selected
- [ ] Add "Install All Selected" button to top bar
- [ ] Show count of selected mods
- [ ] Confirmation dialog before batch install
- [ ] Sequential installation with progress
- [ ] Summary dialog after completion

### Phase 5: Integration
- [ ] Wire ConflictDetailsModal to ModManager
- [ ] Update mod selection state on apply
- [ ] Refresh conflict detection after resolution
- [ ] Persist conflict resolution choices

---

## API Changes

### IPC Events (Electron)

```typescript
// New: Get detailed conflicts for a specific mod
registerEvent("getModConflicts", async (_event, gameId, modName, enabledMods) => {
  return ModConflictService.getModConflicts(gameId, modName, enabledMods);
});

// New: Batch install multiple mods
registerEvent("installModsBatch", async (_event, gameId, modNames, profile) => {
  return InstallService.installBatch(gameId, modNames, profile);
});
```

### Types

```typescript
// Enhanced conflict with deselection support
interface ResolvedConflict {
  file: string;
  mods: {
    name: string;
    priority: number;
    selected: boolean;
    isWinner: boolean;
  }[];
  type: "asset" | "plugin" | "script";
}

// Batch install request
interface BatchInstallRequest {
  gameId: string;
  modNames: string[];
  profile: string;
  resolveConflicts?: boolean;
}

// Batch install result
interface BatchInstallResult {
  success: boolean;
  installed: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
}
```

---

## File Structure

```
tools/Mods_manager/
├── docs/
│   └── conflict-resolution/
│       └── README.md              ← This file
├── services/
│   └── mod-conflict-service.ts    ← Enhanced detection
├── ui/
│   ├── components/
│   │   ├── Modals/
│   │   │   └── ConflictDetailsModal/
│   │   │       ├── ConflictDetailsModal.tsx
│   │   │       ├── ConflictDetailsModal.scss
│   │   │       └── index.ts
│   │   └── ModListPanel/
│   │       └── components/
│   │           └── ModRow/
│   │               ├── ModRow.tsx      ← Enhanced with pulse
│   │               └── ModRow.scss     ← Pulse animation
│   └── hooks/
│       └── mods/
│           └── useConflictBadges.ts    ← Enhanced detection
```

---

## Testing

### Test Cases

1. **No Conflicts:** Install mods with no file overlaps → no badges shown
2. **Plugin Conflict:** Two mods with same `.esp` name → badge shows, modal opens
3. **Asset Conflict:** Two mods with same `.nif` file → badge shows, modal opens
4. **Multiple Conflicts:** Mod conflicts with 3+ other mods → all shown in modal
5. **Resolution:** Deselect mod in modal → badge stops pulsing
6. **Batch Install:** Select 3 mods → install all → all 3 installed
7. **Partial Install:** Select 3, deselect 1 → install 2 selected

### Manual Testing

1. Install "Bijin Warmaidens" and "CBBE Body" (both have `femalehead.nif`)
2. Verify red pulsing animation on both mods
3. Click "!" badge on Bijin
4. Modal shows `femalehead.nif` conflict
5. Deselect "CBBE Body" in modal
6. Click "Apply"
7. Verify CBBE Body is now disabled in modlist
8. Verify pulsing stops on Bijin
9. Click "Install All Selected"
10. Verify only Bijin is installed

---

## Future Enhancements

1. **Conflict Rules:** Save user preferences for specific mod pairs
2. **Auto-Resolve:** Automatically suggest resolution based on priority
3. **Conflict History:** Track past conflicts and resolutions
4. **Visual Preview:** Show diff between conflicting files (textures, meshes)
5. **Load Order Suggestions:** Recommend load order to minimize conflicts

---

## References

- [Skyrim Modding Guide](https://www.creationkit.com/)
- [Nexus Mods Documentation](https://www.nexusmods.com/)
- [Wrye Bash Documentation](https://wrye-bash.github.io/)

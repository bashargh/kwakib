export const createViewerControls = ({
  root = document,
  parseUTC,
  formatUTC,
  roundToMinute,
  caretUnit,
  rangeForUnit,
  adjustDate,
  onDateInput,
  onDateChange,
  onNowClick,
  onSiderealShift,
  onTwilightInput,
  onVisibilityChange,
  getCameraMode,
  setCameraMode,
  applyCameraMode,
  cameraModeSelector = '#cameraSegments button',
  visibilityToggleIds = [],
  sectionVisibility = {},
  sectionSelectors = {},
  controlVisibility = {},
  controlSelectors = {}
} = {}) => {
  const defaults = {
    datetime: ['#datetime'],
    camera: ['#cameraSegments', '#cameraSection'],
    twilight: ['#twilightAngle', '#twilightSection'],
    visibility: ['#toggleSunVisibility', '#sunVenusSection'],
    points: ['#pointSection', '#pointsHeading', '#pointALabel']
  };
  const controlDefaults = {
    sidereal: ['#siderealMinusBtn', '#siderealPlusBtn']
  };
  const selectors = {
    ...defaults,
    ...sectionSelectors
  };
  const controls = {
    ...controlDefaults,
    ...controlSelectors
  };
  const visibility = {
    datetime: true,
    camera: true,
    twilight: true,
    visibility: true,
    points: true,
    ...sectionVisibility
  };
  const controlToggles = {
    sidereal: true,
    ...controlVisibility
  };

  const normalizeSelectors = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const resolveSection = (value) => {
    const candidates = normalizeSelectors(value);
    for (const selector of candidates) {
      const el = root.querySelector(selector);
      if (!el) continue;
      return el.closest('.section') || el.closest('.section.collapsible') || el;
    }
    return null;
  };
  const resolveControls = (value) => {
    const candidates = normalizeSelectors(value);
    const found = [];
    candidates.forEach((selector) => {
      root.querySelectorAll(selector).forEach((el) => found.push(el));
    });
    return found;
  };

  const setSectionVisible = (name, show) => {
    const section = resolveSection(selectors[name]);
    if (!section) return;
    section.style.display = show ? '' : 'none';
  };
  const setControlVisible = (name, show) => {
    const elements = resolveControls(controls[name]);
    if (!elements.length) return;
    elements.forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
  };

  const applySectionVisibility = () => {
    Object.keys(visibility).forEach((key) => {
      setSectionVisible(key, !!visibility[key]);
    });
  };
  const applyControlVisibility = () => {
    Object.keys(controlToggles).forEach((key) => {
      setControlVisible(key, !!controlToggles[key]);
    });
  };

  const datetimeInput = root.getElementById('datetime');
  const resetNowBtn = root.getElementById('resetNowBtn');
  const twilightInput = root.getElementById('twilightAngle');
  const twilightValue = root.getElementById('twilightValue');
  const siderealMinusBtn = root.getElementById('siderealMinusBtn');
  const siderealPlusBtn = root.getElementById('siderealPlusBtn');
  const cameraModeButtons = Array.from(root.querySelectorAll(cameraModeSelector));

  let activeDateUnit = null;

  const setDatetimeValue = (date, emit = false) => {
    if (!datetimeInput || !formatUTC || !date) return;
    const finalDate = roundToMinute ? roundToMinute(date) : date;
    datetimeInput.value = formatUTC(finalDate);
    if (emit && typeof onDateChange === 'function') onDateChange();
  };

  const seedDateTime = () => {
    if (!datetimeInput || !formatUTC) return;
    datetimeInput.value = formatUTC(new Date());
  };

  const setCameraModeButtonsActive = (mode) => {
    cameraModeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
  };

  const setTwilightValue = (value, emit = false) => {
    if (!twilightInput || !twilightValue) return;
    twilightInput.value = value;
    twilightValue.textContent = `${value} deg`;
    if (emit && typeof onTwilightInput === 'function') onTwilightInput(value);
  };

  const setVisibilityToggle = (id, checked, emit = false) => {
    if (!id) return;
    const toggle = root.getElementById(id);
    if (!toggle) return;
    toggle.checked = !!checked;
    if (emit && typeof onVisibilityChange === 'function') onVisibilityChange(id, toggle.checked);
  };

  const setCameraModeValue = (mode, apply = true) => {
    if (typeof setCameraMode === 'function') setCameraMode(mode);
    setCameraModeButtonsActive(mode);
    if (apply && typeof applyCameraMode === 'function') applyCameraMode();
  };

  if (datetimeInput && parseUTC && formatUTC && caretUnit && rangeForUnit && adjustDate) {
    datetimeInput.addEventListener('change', () => {
      if (typeof onDateChange === 'function') onDateChange();
    });
    datetimeInput.addEventListener('input', () => {
      if (typeof onDateInput === 'function') onDateInput();
    });
    datetimeInput.addEventListener('click', () => {
      const pos = datetimeInput.selectionStart ?? 0;
      activeDateUnit = caretUnit(pos);
    });
    datetimeInput.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const pos = datetimeInput.selectionStart ?? 0;
      const unit = activeDateUnit ?? caretUnit(pos);
      activeDateUnit = unit;
      const delta = event.key === 'ArrowUp' ? 1 : -1;
      const current = parseUTC(datetimeInput.value) ?? new Date();
      adjustDate(current, unit, delta);
      datetimeInput.value = formatUTC(current);
      const range = rangeForUnit(unit);
      requestAnimationFrame(() => datetimeInput.setSelectionRange(range.start, range.end));
      if (typeof onDateChange === 'function') onDateChange();
    });
  }

  if (resetNowBtn) {
    resetNowBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof onNowClick === 'function') {
        onNowClick();
      } else {
        seedDateTime();
      }
      if (typeof onDateChange === 'function') onDateChange();
    });
  }
  if (siderealMinusBtn) {
    siderealMinusBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof onSiderealShift === 'function') onSiderealShift(-1);
    });
  }
  if (siderealPlusBtn) {
    siderealPlusBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof onSiderealShift === 'function') onSiderealShift(1);
    });
  }

  if (twilightInput && twilightValue) {
    twilightInput.addEventListener('input', () => {
      twilightValue.textContent = `${twilightInput.value} deg`;
      if (typeof onTwilightInput === 'function') onTwilightInput(twilightInput.value);
    });
  }

  if (cameraModeButtons.length && typeof setCameraMode === 'function') {
    cameraModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (!mode) return;
        setCameraModeValue(mode, true);
      });
    });
  }

  if (visibilityToggleIds && visibilityToggleIds.length) {
    visibilityToggleIds.forEach((id) => {
      const toggle = root.getElementById(id);
      if (!toggle) return;
      toggle.addEventListener('change', () => {
        if (typeof onVisibilityChange === 'function') onVisibilityChange(id, toggle.checked);
      });
    });
  }

  applySectionVisibility();
  applyControlVisibility();

  return {
    datetimeInput,
    resetNowBtn,
    twilightInput,
    twilightValue,
    siderealMinusBtn,
    siderealPlusBtn,
    cameraModeButtons,
    seedDateTime,
    setDatetimeValue,
    setTwilightValue,
    setVisibilityToggle,
    setCameraModeButtonsActive,
    setCameraModeValue,
    setSectionVisible,
    applySectionVisibility,
    setControlVisible,
    applyControlVisibility
  };
};

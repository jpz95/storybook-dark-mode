import * as React from 'react';
import { themes, ThemeVars } from '@storybook/theming';
import { IconButton } from '@storybook/components';
import {
  STORY_CHANGED,
  SET_STORIES,
  DOCS_RENDERED
} from '@storybook/core-events';
import { API, useParameter } from '@storybook/api';
import equal from 'fast-deep-equal';
import {
  DARK_MODE_EVENT_NAME,
  UPDATE_DARK_MODE_EVENT_NAME
} from './constants';

import Sun from './icons/Sun';
import Moon from './icons/Moon';

const modes = ['light', 'dark'] as const;
type Mode = typeof modes[number];

interface DarkModeParams {
  /** The current mode the storybook is set to */
  current: Mode;
  /** The dark theme for storybook */
  dark: ThemeVars;
  /** The dark class name for the manager app or preview iframe */
  darkClass: string;
  /** The light theme for storybook */
  light: ThemeVars;
  /** The light class name for the manager app or preview iframe */
  lightClass: string;
  /** Configure how we want to set dark mode within the preview iframe **/
  previewParams: DarkModePreviewParams;
}

// How do we want to edit elements in the preview/canvas iframe
interface DarkModePreviewParams {
  /** The element to target within the preview iframe */
  classTarget: string;
  /** The element to target within the preview iframe **/
  attributeTarget: string;
  /** The name (or key) of the attribute **/
  attributeName: 'theme';
  /** The attribute value when in dark mode **/
  darkAttribute: string;
  /** The attribute value when in light mode **/
  lightAttribute: string;
}

const STORAGE_KEY = 'sb-addon-themes-3';
export const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

const defaultParams: Required<Omit<DarkModeParams, 'current' | 'previewParams'>> = {
  dark: themes.dark,
  darkClass: 'dark',
  light: themes.light,
  lightClass: 'light',
};

const defaultPreviewParams: Required<Omit<DarkModePreviewParams, 'attributeTarget'>> = {
  classTarget: 'body',
  attributeName: 'theme',
  darkAttribute: 'dark',
  lightAttribute: 'light',
}

/** Persist the dark mode settings in localStorage */
export const updateStore = (newStore: DarkModeParams) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newStore));
};

/** Add the light/dark class to an element */
const toggleDarkClass = (el: HTMLElement, { current, darkClass = defaultParams.darkClass, lightClass = defaultParams.lightClass }: DarkModeParams) => {
  if (current === 'dark') {
    el.classList.add(darkClass);
    el.classList.remove(lightClass);
  } else {
    el.classList.add(lightClass);
    el.classList.remove(darkClass);
  }
}

/** Add the light/dark attribute value **/
const toggleDarkAttribute = (
  el: HTMLElement,
  {
    current,
    previewParams: {
      attributeName = defaultPreviewParams.attributeName,
      darkAttribute = defaultPreviewParams.darkAttribute,
      lightAttribute = defaultPreviewParams.lightAttribute
    }
  }: DarkModeParams,
) => {
  if (current === 'dark') {
    el.setAttribute(attributeName, darkAttribute);
  } else {
    el.setAttribute(attributeName, lightAttribute);
  }
}

/** Update the preview iframe class */
const updatePreview = (store: DarkModeParams) => {
  const iframe = document.getElementById('storybook-preview-iframe') as HTMLIFrameElement;

  if (!iframe) {
    return;
  }

  const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
  const classTarget = iframeDocument?.querySelector(store.previewParams.classTarget) as HTMLElement;
  if (!classTarget) {
    return;
  }

  toggleDarkClass(classTarget, store);

  const attributeTarget = iframeDocument?.querySelector(store.previewParams.attributeTarget) as HTMLElement;;
  if (!attributeTarget) {
    return;
  }

  toggleDarkAttribute(attributeTarget, store);
};

/** Update the manager iframe class */
const updateManager = (store: DarkModeParams) => {
  const manager = document.querySelector('body');

  if (!manager) {
    return;
  }

  toggleDarkClass(manager, store)
};

/** Update changed dark mode settings and persist to localStorage  */
export const store = (userTheme: Partial<DarkModeParams> = {}): DarkModeParams => {
  const storedItem = window.localStorage.getItem(STORAGE_KEY);

  if (typeof storedItem === 'string') {
    const stored: DarkModeParams = JSON.parse(storedItem);

    if (userTheme) {
      if (userTheme.dark && !equal(stored.dark, userTheme.dark)) {
        stored.dark = userTheme.dark;
        updateStore(stored);
      }

      if (userTheme.light && !equal(stored.light, userTheme.light)) {
        stored.light = userTheme.light;
        updateStore(stored);
      }
    }

    return stored;
  }

  return { ...defaultParams, ...userTheme } as DarkModeParams;
};

interface StorybookApiHook {
  /** The storybook API */
  api: API;
}

/** A toolbar icon to toggle between dark and light themes in storybook */
export const DarkMode = ({ api }: StorybookApiHook) => {
  const [isDark, setDark] = React.useState(prefersDark.matches);
  const darkModeParams = useParameter<Partial<DarkModeParams>>('darkMode', {});
  const { current: defaultMode, previewParams, ...params } = darkModeParams

  const channel = api.getChannel();

  // Save custom themes on init
  const initialMode = React.useMemo(() => store(params).current, [params]);

  /** Set the theme in storybook, update the local state, and emit an event */
  const setMode = React.useCallback(
    (mode: Mode) => {
      const currentStore = store();
      api.setOptions({ theme: currentStore[mode] });
      setDark(mode === 'dark');
      api.getChannel().emit(DARK_MODE_EVENT_NAME, mode === 'dark');
      updateManager(currentStore)

      if (previewParams) {
        updatePreview(currentStore);
      }
    },
    [api, previewParams]
  );

  /** Update the theme settings in localStorage, react, and storybook */
  const updateMode = React.useCallback(
    (mode?: Mode) => {
      const currentStore = store();
      const current =
        mode || (currentStore.current === 'dark' ? 'light' : 'dark');

      updateStore({ ...currentStore, current });
      setMode(current);
    },
    [setMode]
  );

  /** Update the theme based on the color preference */
  function prefersDarkUpdate(event: MediaQueryListEvent) {
    updateMode(event.matches ? 'dark' : 'light');
  }

  /** Render the current theme */
  const renderTheme = React.useCallback(()  => {
    const { current = 'light' } = store();
    setMode(current);
  }, [setMode])

  /** When storybook params change update the stored themes */
  React.useEffect(() => {
    const currentStore = store();

    updateStore({ ...currentStore, ...darkModeParams });
    renderTheme()
  }, [darkModeParams, renderTheme])

  React.useEffect(() => {
    channel.on(STORY_CHANGED, renderTheme);
    channel.on(SET_STORIES, renderTheme);
    channel.on(DOCS_RENDERED, renderTheme);
    prefersDark.addListener(prefersDarkUpdate);

    return () => {
      channel.removeListener(STORY_CHANGED, renderTheme);
      channel.removeListener(SET_STORIES, renderTheme);
      channel.removeListener(DOCS_RENDERED, renderTheme);
      prefersDark.removeListener(prefersDarkUpdate);
    };
  });

  React.useEffect(() => {
    channel.on(UPDATE_DARK_MODE_EVENT_NAME, updateMode);

    return () => {
      channel.removeListener(UPDATE_DARK_MODE_EVENT_NAME, updateMode);
    };
  });

  // Storybook's first render doesn't have the global user params loaded so we
  // need the effect to run whenever defaultMode is updated
  React.useEffect(() => {
    // If a users has set the mode this is respected
    if (initialMode) {
      return;
    }

    if (defaultMode) {
      updateMode(defaultMode);
    } else if (prefersDark.matches) {
      updateMode('dark');
    }
  }, [defaultMode, updateMode, initialMode]);

  return (
    <IconButton
      key="dark-mode"
      active={isDark}
      title={
        isDark ? 'Change theme to light mode' : 'Change theme to dark mode'
      }
      onClick={() => updateMode()}
    >
      {isDark ? <Sun /> : <Moon />}
    </IconButton>
  );
};

export default DarkMode;

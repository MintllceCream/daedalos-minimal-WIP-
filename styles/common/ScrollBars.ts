import { type RuleSet, css } from "styled-components";
import { DOWN, LEFT, RIGHT, UP } from "styles/ArrowIcons";
import { DEFAULT_SCROLLBAR_WIDTH } from "utils/constants";

type ColorSchemes = "dark" | "light";

type ColorScheme = {
  active: string;
  blendMode: string;
  buttonHover: string;
  thumb: string;
  thumbHover: string;
  track: string;
};

const colorScheme: Record<ColorSchemes, ColorScheme> = {
  dark: {
    active: "rgb(166, 166, 166)",
    blendMode: "color-burn",
    buttonHover: "rgb(55, 55, 55)",
    thumb: "rgb(77, 77, 77)",
    thumbHover: "rgb(122, 122, 122)",
    track: "rgb(23, 23, 23)",
  },
  light: {
    active: "rgb(96, 96, 96)",
    blendMode: "color-dodge",
    buttonHover: "rgb(218, 218, 218)",
    thumb: "rgb(205, 205, 205)",
    thumbHover: "rgb(166, 166, 166)",
    track: "rgb(240, 240, 240)",
  },
};

const ScrollBars = (
  size = DEFAULT_SCROLLBAR_WIDTH,
  verticalX = 0,
  verticalY = 0,
  scheme: ColorSchemes = "dark"
): RuleSet<object> => css`
  overflow: auto;
  scrollbar-gutter: stable;

  @supports not selector(::-webkit-scrollbar) {
    scrollbar-color: ${colorScheme[scheme].thumb} ${colorScheme[scheme].track};
  }

  &::-webkit-scrollbar {
    background: transparent;
    height: var(--skin-scrollbar-width, ${size}px);
    width: var(--skin-scrollbar-width, ${size}px);
  }

  &::-webkit-scrollbar-corner {
    background-color: var(--skin-color-window, ${colorScheme[scheme].track});
    background-image: var(--skin-scrollbar-corner, none);
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }

  &::-webkit-scrollbar-track {
    background-color: var(--skin-color-scrollbar, ${colorScheme[scheme].track});
  }

  &::-webkit-scrollbar-track:vertical {
    background-image:
      var(--skin-scrollbar-track-v-top, none),
      var(--skin-scrollbar-track-v-mid, none),
      var(--skin-scrollbar-track-v-bot, none);
    background-position:
      top center,
      top var(--skin-scrollbar-track-v-cap-start, 0) center,
      bottom center;
    background-repeat: no-repeat, repeat-y, no-repeat;
    background-size:
      100% var(--skin-scrollbar-track-v-cap-start, 0),
      100% auto,
      100% var(--skin-scrollbar-track-v-cap-end, 0);
  }

  &::-webkit-scrollbar-track:horizontal {
    background-image:
      var(--skin-scrollbar-track-h-top, none),
      var(--skin-scrollbar-track-h-mid, none),
      var(--skin-scrollbar-track-h-bot, none);
    background-position:
      left center,
      left var(--skin-scrollbar-track-h-cap-start, 0) center,
      right center;
    background-repeat: no-repeat, repeat-x, no-repeat;
    background-size:
      var(--skin-scrollbar-track-h-cap-start, 0) 100%,
      auto 100%,
      var(--skin-scrollbar-track-h-cap-end, 0) 100%;
  }

  /* ── Thumb: specificity level 0 (base) ── */

  &::-webkit-scrollbar-thumb {
    background-clip: padding-box;
    background-color: var(
      --skin-scrollbar-thumb-v-bg,
      ${colorScheme[scheme].thumb}
    );
  }

  /* ── Thumb: specificity level 1 (one pseudo-class) ── */

  &::-webkit-scrollbar-thumb:hover {
    background-color: var(
      --skin-scrollbar-thumb-v-bg,
      ${colorScheme[scheme].thumbHover}
    );
  }

  &::-webkit-scrollbar-thumb:active {
    background-color: var(
      --skin-scrollbar-thumb-v-bg,
      ${colorScheme[scheme].active}
    );
  }

  &::-webkit-scrollbar-thumb:vertical {
    background-clip: var(--skin-scrollbar-thumb-v-clip, padding-box);
    background-color: var(
      --skin-scrollbar-thumb-v-bg,
      ${colorScheme[scheme].thumb}
    );
    background-image:
      var(--skin-scrollbar-thumb-v-top, none),
      var(--skin-scrollbar-thumb-v-mid, none),
      var(--skin-scrollbar-thumb-v-bot, none);
    background-position:
      top center,
      center center,
      bottom center;
    background-repeat: no-repeat;
    background-size:
      100% var(--skin-scrollbar-thumb-v-cap-start, 0),
      100%
        calc(
          100% - var(--skin-scrollbar-thumb-v-cap-start, 0px) - var(
              --skin-scrollbar-thumb-v-cap-end,
              0px
            )
        ),
      100% var(--skin-scrollbar-thumb-v-cap-end, 0);
    border-left: var(--skin-scrollbar-thumb-v-border, 1px solid transparent);
    border-right: var(--skin-scrollbar-thumb-v-border, 1px solid transparent);
  }

  &::-webkit-scrollbar-thumb:horizontal {
    background-clip: var(--skin-scrollbar-thumb-h-clip, padding-box);
    background-color: var(
      --skin-scrollbar-thumb-h-bg,
      ${colorScheme[scheme].thumb}
    );
    background-image:
      var(--skin-scrollbar-thumb-h-top, none),
      var(--skin-scrollbar-thumb-h-mid, none),
      var(--skin-scrollbar-thumb-h-bot, none);
    background-position:
      left center,
      center center,
      right center;
    background-repeat: no-repeat;
    background-size:
      var(--skin-scrollbar-thumb-h-cap-start, 0) 100%,
      calc(
          100% - var(--skin-scrollbar-thumb-h-cap-start, 0px) - var(
              --skin-scrollbar-thumb-h-cap-end,
              0px
            )
        )
        100%,
      var(--skin-scrollbar-thumb-h-cap-end, 0) 100%;
    border-bottom: var(--skin-scrollbar-thumb-h-border, 1px solid transparent);
    border-top: var(--skin-scrollbar-thumb-h-border, 1px solid transparent);
  }

  /* ── Thumb: specificity level 2 (two pseudo-classes) ── */

  &::-webkit-scrollbar-thumb:vertical:hover {
    background-image:
      var(
        --skin-scrollbar-thumb-v-top-hover,
        var(--skin-scrollbar-thumb-v-top, none)
      ),
      var(
        --skin-scrollbar-thumb-v-mid-hover,
        var(--skin-scrollbar-thumb-v-mid, none)
      ),
      var(
        --skin-scrollbar-thumb-v-bot-hover,
        var(--skin-scrollbar-thumb-v-bot, none)
      );
  }

  &::-webkit-scrollbar-thumb:vertical:active {
    background-image:
      var(
        --skin-scrollbar-thumb-v-top-active,
        var(--skin-scrollbar-thumb-v-top, none)
      ),
      var(
        --skin-scrollbar-thumb-v-mid-active,
        var(--skin-scrollbar-thumb-v-mid, none)
      ),
      var(
        --skin-scrollbar-thumb-v-bot-active,
        var(--skin-scrollbar-thumb-v-bot, none)
      );
  }

  &::-webkit-scrollbar-thumb:horizontal:hover {
    background-image:
      var(
        --skin-scrollbar-thumb-h-top-hover,
        var(--skin-scrollbar-thumb-h-top, none)
      ),
      var(
        --skin-scrollbar-thumb-h-mid-hover,
        var(--skin-scrollbar-thumb-h-mid, none)
      ),
      var(
        --skin-scrollbar-thumb-h-bot-hover,
        var(--skin-scrollbar-thumb-h-bot, none)
      );
  }

  &::-webkit-scrollbar-thumb:horizontal:active {
    background-image:
      var(
        --skin-scrollbar-thumb-h-top-active,
        var(--skin-scrollbar-thumb-h-top, none)
      ),
      var(
        --skin-scrollbar-thumb-h-mid-active,
        var(--skin-scrollbar-thumb-h-mid, none)
      ),
      var(
        --skin-scrollbar-thumb-h-bot-active,
        var(--skin-scrollbar-thumb-h-bot, none)
      );
  }

  /* ── Arrow buttons: specificity level 0 (base) ── */

  &::-webkit-scrollbar-button:single-button {
    background-clip: border-box;
    background-color: var(--skin-color-scrollbar, ${colorScheme[scheme].track});
    background-origin: border-box;
    background-position: center;
    background-repeat: no-repeat;
    background-size: 100% 100%;
    border: 1px solid var(--skin-color-scrollbar, ${colorScheme[scheme].track});
    display: block;
    height: var(--skin-scrollbar-width, ${size ? `${size}px` : "initial"});
  }

  /* ── Arrow buttons: specificity level 1 ── */

  &::-webkit-scrollbar-button:single-button:hover {
    background-color: ${colorScheme[scheme].buttonHover};
  }

  &::-webkit-scrollbar-button:single-button:active {
    background-color: ${colorScheme[scheme].active};
  }

  &::-webkit-scrollbar-button:single-button:vertical:decrement {
    background-image: var(--skin-scrollbar-arrow-up, url(${UP}));
    background-position: ${verticalX === 0 ? "center" : `${verticalX}px`}
      ${verticalY === 0 ? "center" : `${verticalY}px`};
    background-size: var(--skin-scrollbar-width, 16px);
    border-bottom: 0;
    border-top: 0;
  }

  &::-webkit-scrollbar-button:single-button:vertical:increment {
    background-image: var(--skin-scrollbar-arrow-down, url(${DOWN}));
    background-position: ${verticalX === 0 ? "center" : `${verticalX}px`}
      ${verticalY === 0 ? "center" : `${verticalY}px`};
    background-size: var(--skin-scrollbar-width, 16px);
    border-bottom: 0;
    border-top: 0;
  }

  &::-webkit-scrollbar-button:single-button:horizontal:decrement {
    background-image: var(--skin-scrollbar-arrow-left, url(${LEFT}));
    background-position: center;
    background-size: 100% 100%;
    border-left: 0;
    border-right: 0;
  }

  &::-webkit-scrollbar-button:single-button:horizontal:increment {
    background-image: var(--skin-scrollbar-arrow-right, url(${RIGHT}));
    background-position: center;
    background-size: 100% 100%;
    border-left: 0;
    border-right: 0;
  }

  /* ── Arrow buttons: specificity level 2 (hover/active + direction) ── */

  &::-webkit-scrollbar-button:single-button:vertical:decrement:hover {
    background-image: var(
      --skin-scrollbar-arrow-up-hover,
      var(--skin-scrollbar-arrow-up, url(${UP}))
    );
  }

  &::-webkit-scrollbar-button:single-button:vertical:decrement:active {
    background-blend-mode: ${colorScheme[scheme].blendMode};
    background-image: var(
      --skin-scrollbar-arrow-up-active,
      var(--skin-scrollbar-arrow-up, url(${UP}))
    );
  }

  &::-webkit-scrollbar-button:single-button:vertical:increment:hover {
    background-image: var(
      --skin-scrollbar-arrow-down-hover,
      var(--skin-scrollbar-arrow-down, url(${DOWN}))
    );
  }

  &::-webkit-scrollbar-button:single-button:vertical:increment:active {
    background-blend-mode: ${colorScheme[scheme].blendMode};
    background-image: var(
      --skin-scrollbar-arrow-down-active,
      var(--skin-scrollbar-arrow-down, url(${DOWN}))
    );
  }

  &::-webkit-scrollbar-button:single-button:horizontal:decrement:hover {
    background-image: var(
      --skin-scrollbar-arrow-left-hover,
      var(--skin-scrollbar-arrow-left, url(${LEFT}))
    );
  }

  &::-webkit-scrollbar-button:single-button:horizontal:decrement:active {
    background-blend-mode: ${colorScheme[scheme].blendMode};
    background-image: var(
      --skin-scrollbar-arrow-left-active,
      var(--skin-scrollbar-arrow-left, url(${LEFT}))
    );
  }

  &::-webkit-scrollbar-button:single-button:horizontal:increment:hover {
    background-image: var(
      --skin-scrollbar-arrow-right-hover,
      var(--skin-scrollbar-arrow-right, url(${RIGHT}))
    );
  }

  &::-webkit-scrollbar-button:single-button:horizontal:increment:active {
    background-blend-mode: ${colorScheme[scheme].blendMode};
    background-image: var(
      --skin-scrollbar-arrow-right-active,
      var(--skin-scrollbar-arrow-right, url(${RIGHT}))
    );
  }
`;

export default ScrollBars;

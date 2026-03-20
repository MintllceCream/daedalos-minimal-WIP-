import { m as motion } from "motion/react";
import styled from "styled-components";
import StyledLoading from "components/system/Apps/StyledLoading";

type StyledWindowProps = {
  $backgroundBlur?: string;
  $backgroundColor?: string;
  $isForeground: boolean;
};

const StyledWindow = styled(motion.section)<StyledWindowProps>`
  background-color: var(
    --skin-color-window,
    ${({ $backgroundColor, theme }) =>
      $backgroundColor || theme.colors.window.background}
  );
  border-radius: var(--skin-window-border-radius, 0)
    var(--skin-window-border-radius, 0)
    var(--skin-window-border-radius-bottom, 0)
    var(--skin-window-border-radius-bottom, 0);
  box-shadow: var(
    --skin-window-shadow,
    ${({ $isForeground, theme }) =>
      $isForeground
        ? theme.colors.window.shadow
        : theme.colors.window.shadowInactive}
  );
  contain: var(--skin-window-contain, strict);
  height: 100%;
  outline: var(
    --skin-window-outline,
    ${({ $isForeground, theme }) =>
      `${theme.sizes.window.outline} solid ${
        $isForeground
          ? theme.colors.window.outline
          : theme.colors.window.outlineInactive
      }`}
  );
  overflow: var(--skin-window-overflow, hidden);
  position: absolute;
  width: 100%;

  header + * {
    /* stylelint-disable length-zero-no-unit */
    height: ${({ theme }) =>
      `calc(100% - var(--skin-tb-height, ${theme.sizes.titleBar.height}px) - var(--skin-frame-bottom-inset, 0px))`};
    margin-left: var(--skin-frame-left-inset, 0);
    margin-right: var(--skin-frame-right-inset, 0);
    position: relative;
    z-index: 1;
  }

  ${StyledLoading} {
    backdrop-filter: ${({ $backgroundBlur }) =>
      $backgroundBlur ? `blur(${$backgroundBlur})` : undefined};
  }

  &::before {
    background-image: ${({ $isForeground }) =>
      $isForeground
        ? [
            "var(--skin-frame-bottom-left, none)",
            "var(--skin-frame-bottom-right, none)",
            "var(--skin-frame-left-top, none)",
            "var(--skin-frame-left, none)",
            "var(--skin-frame-left-bot, none)",
            "var(--skin-frame-right-top, none)",
            "var(--skin-frame-right, none)",
            "var(--skin-frame-right-bot, none)",
            "var(--skin-frame-bottom, none)",
          ].join(", ")
        : [
            "var(--skin-frame-bottom-left-i, var(--skin-frame-bottom-left, none))",
            "var(--skin-frame-bottom-right-i, var(--skin-frame-bottom-right, none))",
            "var(--skin-frame-left-top-i, var(--skin-frame-left-top, none))",
            "var(--skin-frame-left-i, var(--skin-frame-left, none))",
            "var(--skin-frame-left-bot-i, var(--skin-frame-left-bot, none))",
            "var(--skin-frame-right-top-i, var(--skin-frame-right-top, none))",
            "var(--skin-frame-right-i, var(--skin-frame-right, none))",
            "var(--skin-frame-right-bot-i, var(--skin-frame-right-bot, none))",
            "var(--skin-frame-bottom-i, var(--skin-frame-bottom, none))",
          ].join(", ")};
    background-position:
      0 100%,
      100% 100%,
      0 0,
      0 var(--skin-frame-left-top-h, 0),
      0 100%,
      100% 0,
      100% var(--skin-frame-right-top-h, 0),
      100% 100%,
      var(--skin-frame-bottom-x, 0) 100%;
    background-repeat:
      no-repeat, no-repeat, no-repeat, var(--skin-frame-left-repeat, repeat-y),
      no-repeat, no-repeat, var(--skin-frame-right-repeat, repeat-y), no-repeat,
      var(--skin-frame-bottom-repeat, repeat-x);
    background-size:
      var(--skin-frame-bottom-left-w, 0) var(--skin-frame-bottom-width, 0),
      var(--skin-frame-bottom-right-w, 0) var(--skin-frame-bottom-width, 0),
      var(--skin-frame-left-width, 0) var(--skin-frame-left-top-h, 0),
      var(--skin-frame-left-width, 0) var(--skin-frame-left-size-h, auto),
      var(--skin-frame-left-width, 0) var(--skin-frame-left-bot-h, 0),
      var(--skin-frame-right-width, 0) var(--skin-frame-right-top-h, 0),
      var(--skin-frame-right-width, 0) var(--skin-frame-right-size-h, auto),
      var(--skin-frame-right-width, 0) var(--skin-frame-right-bot-h, 0),
      var(--skin-frame-bottom-size-w, auto) var(--skin-frame-bottom-width, 0);
    border-radius: var(--skin-frame-border-radius, 0);
    content: "";
    inset: 0 var(--skin-frame-right-offset, 0)
      var(--skin-frame-bottom-offset, 0) var(--skin-frame-left-offset, 0);
    pointer-events: none;
    position: absolute;
    z-index: 1;
  }
`;

export default StyledWindow;

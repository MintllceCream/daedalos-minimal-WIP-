import styled, { type DefaultTheme } from "styled-components";

type StyledTitlebarProps = {
  $foreground: boolean;
};

const styledBorder = ({
  $foreground,
  theme,
}: StyledTitlebarProps & { theme: DefaultTheme }): string =>
  $foreground
    ? `1px solid ${theme.colors.titleBar.background}`
    : `1px solid ${theme.colors.titleBar.backgroundInactive}`;

const StyledTitlebar = styled.header<StyledTitlebarProps>`
  background-clip:
    border-box, border-box, border-box, var(--skin-tb-clip, border-box);
  background-color: ${({ $foreground, theme }) =>
    `var(--skin-tb-bg-color, ${
      $foreground
        ? theme.colors.titleBar.background
        : theme.colors.titleBar.backgroundInactive
    })`};
  background-image: ${({ $foreground }) =>
    $foreground
      ? [
          "var(--skin-tb-corner-right, none)",
          "var(--skin-tb-corner-left, none)",
          "var(--skin-tb-decor-img, none)",
          "var(--skin-tb-active-bg, none)",
        ].join(", ")
      : [
          "var(--skin-tb-corner-right-i, var(--skin-tb-corner-right, none))",
          "var(--skin-tb-corner-left-i, var(--skin-tb-corner-left, none))",
          "var(--skin-tb-decor-img, none)",
          "var(--skin-tb-inactive-bg, var(--skin-tb-active-bg, none))",
        ].join(", ")};
  background-origin:
    border-box, border-box, border-box, var(--skin-tb-origin, padding-box);
  background-position: ${({ $foreground }) =>
    [
      "100% 0",
      "0 0",
      $foreground
        ? "var(--skin-tb-decor-pos, 0 0)"
        : "var(--skin-tb-decor-pos-inactive, var(--skin-tb-decor-pos, 0 0))",
      $foreground
        ? "var(--skin-tb-bg-pos, 0 0)"
        : "var(--skin-tb-bg-pos-inactive, var(--skin-tb-bg-pos, 0 0))",
    ].join(", ")};
  background-repeat:
    no-repeat, no-repeat, no-repeat, var(--skin-tb-bg-repeat, no-repeat);
  background-size:
    var(--skin-tb-corner-right-size, 0 0), var(--skin-tb-corner-left-size, 0 0),
    var(--skin-tb-decor-size, 0 0), var(--skin-tb-bg-size, 100% 100%);
  border-bottom: ${({ $foreground, theme }) =>
    `var(--skin-tb-border-bottom, ${styledBorder({ $foreground, theme })})`};
  border-radius: var(--skin-window-border-radius, 0)
    var(--skin-window-border-radius, 0) 0 0;
  display: flex;
  height: var(
    --skin-tb-height,
    ${({ theme }) => theme.sizes.titleBar.height}px
  );
  margin-left: var(--skin-tb-margin-left, 0);
  margin-right: var(--skin-tb-margin-right, 0);
  overflow: hidden;
  padding-left: var(--skin-tb-pad-left, 0);
  padding-right: var(--skin-tb-pad-right, 0);
  position: relative;
  top: 0;
  z-index: 2;

  > button {
    align-items: center;
    color: ${({ $foreground, theme }) =>
      $foreground
        ? `var(--skin-tb-text, ${theme.colors.titleBar.text})`
        : `var(--skin-tb-text-inactive, var(--skin-tb-text, ${theme.colors.titleBar.textInactive}))`};
    display: flex;
    flex-grow: 1;
    font-size: ${({ theme }) => theme.sizes.titleBar.fontSize};
    font-weight: 400;
    inset: var(--skin-tb-title-inset, auto);
    justify-content: var(--skin-tb-title-justify, flex-start);
    min-width: 0;
    position: var(--skin-tb-title-position, static);

    figure {
      align-items: center;
      display: flex;
      margin-left: var(--skin-tb-figure-margin, 8px);
      max-width: var(--skin-tb-figure-max-width);
      min-width: inherit;
      pointer-events: none;
      position: relative;
      top: -1px;

      picture {
        display: var(--skin-tb-icon-display, block);
        height: ${({ theme }) => theme.sizes.titleBar.iconSize};
        margin-right: ${({ theme }) => theme.sizes.titleBar.iconMarginRight};
        width: ${({ theme }) => theme.sizes.titleBar.iconSize};
      }

      img,
      picture {
        pointer-events: all;
      }

      figcaption {
        border-image-repeat: stretch;
        border-image-slice: var(--skin-tb-textback-slice, 0);
        border-image-source: ${({ $foreground }) =>
          $foreground
            ? "var(--skin-tb-textback-img, none)"
            : "var(--skin-tb-textback-img-i, var(--skin-tb-textback-img, none))"};
        border-image-width: var(--skin-tb-textback-width, 0);
        overflow: hidden;
        padding: var(--skin-tb-textback-pad, 0);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  nav {
    display: flex;
    ${({ $foreground }) =>
      $foreground ? "" : "filter: var(--skin-btn-inactive-filter, none);"}
    gap: var(--skin-btn-gap, 0);
    margin-left: var(--skin-nav-left-margin, 0);
    margin-right: var(--skin-nav-right-margin, 0);
    order: var(--skin-nav-order, 0);
    position: relative;
    z-index: 1;

    button {
      background-position: 0 var(--skin-btn-bg-y, center);
      background-repeat: no-repeat;
      background-size: 100% 100%;
      border-left: var(--skin-btn-border, ${styledBorder});
      box-sizing: content-box;
      display: flex;
      place-content: center;
      place-items: center;
      width: var(
        --skin-btn-width,
        ${({ theme }) => theme.sizes.titleBar.buttonWidth}
      );

      &.close {
        background-image: ${({ $foreground }) =>
          $foreground
            ? "var(--skin-btn-close-img, none)"
            : "var(--skin-btn-close-img-i, var(--skin-btn-close-img, none))"};
        background-size: calc(
            var(--skin-btn-close-frames, 1) *
              var(--skin-btn-close-frame-width, var(--skin-btn-width, 45px))
          )
          var(--skin-btn-height, 100%);
        order: var(--skin-btn-close-order, 0);
        width: var(
          --skin-btn-close-width,
          var(
            --skin-btn-width,
            ${({ theme }) => theme.sizes.titleBar.buttonWidth}
          )
        );
      }

      svg {
        fill: ${({ $foreground, theme }) =>
          $foreground
            ? theme.colors.titleBar.text
            : theme.colors.titleBar.buttonInactive};
        margin: 0 1px 2px 0;
        visibility: var(--skin-btn-svg, visible);
        width: ${({ theme }) => theme.sizes.titleBar.buttonIconWidth};
      }

      &.minimize {
        background-image: ${({ $foreground }) =>
          $foreground
            ? "var(--skin-btn-min-img, none)"
            : "var(--skin-btn-min-img-i, var(--skin-btn-min-img, none))"};
        background-size: calc(
            var(--skin-btn-min-frames, 1) *
              var(--skin-btn-min-frame-width, var(--skin-btn-width, 45px))
          )
          var(--skin-btn-height, 100%);
        order: var(--skin-btn-min-order, 0);

        svg {
          margin-bottom: 1px;
          margin-right: 0;
        }

        width: var(
          --skin-btn-min-width,
          var(
            --skin-btn-width,
            ${({ theme }) => theme.sizes.titleBar.buttonWidth}
          )
        );
      }

      &.maximize {
        background-image: ${({ $foreground }) =>
          $foreground
            ? "var(--skin-btn-max-img, none)"
            : "var(--skin-btn-max-img-i, var(--skin-btn-max-img, none))"};
        background-size: calc(
            var(--skin-btn-max-frames, 1) *
              var(--skin-btn-max-frame-width, var(--skin-btn-width, 45px))
          )
          var(--skin-btn-height, 100%);
        order: var(--skin-btn-max-order, 0);
        width: var(
          --skin-btn-max-width,
          var(
            --skin-btn-width,
            ${({ theme }) => theme.sizes.titleBar.buttonWidth}
          )
        );
      }

      &:hover {
        background-color: var(
          --skin-btn-hover-bg,
          ${({ theme }) => theme.colors.titleBar.backgroundHover}
        );

        svg {
          fill: ${({ theme }) => theme.colors.titleBar.text};
        }

        &.close {
          background-color: var(
            --skin-btn-hover-bg,
            ${({ theme }) => theme.colors.titleBar.closeHover}
          );
          background-image: var(--skin-btn-close-img, none);
          background-position: calc(
              -1 *
                var(--skin-btn-close-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
          transition: background-color 0.25s ease;
        }

        &.maximize {
          background-image: var(--skin-btn-max-img, none);
          background-position: calc(
              -1 * var(--skin-btn-max-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
        }

        &.minimize {
          background-image: var(--skin-btn-min-img, none);
          background-position: calc(
              -1 * var(--skin-btn-min-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
        }
      }

      &:active {
        background-color: var(--skin-btn-active-bg, rgb(51 51 51));

        &.close {
          background-color: var(--skin-btn-active-bg, rgb(139 10 20));
          background-image: var(--skin-btn-close-img, none);
          background-position: calc(
              -2 *
                var(--skin-btn-close-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
        }

        &.maximize {
          background-image: var(--skin-btn-max-img, none);
          background-position: calc(
              -2 * var(--skin-btn-max-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
        }

        &.minimize {
          background-image: var(--skin-btn-min-img, none);
          background-position: calc(
              -2 * var(--skin-btn-min-frame-width, var(--skin-btn-width, 45px))
            )
            var(--skin-btn-bg-y, center);
        }
      }

      &:disabled {
        svg {
          fill: ${({ $foreground }) =>
            $foreground ? "rgb(50, 50, 50)" : "rgb(60, 60, 60)"};
        }

        &:hover {
          background-color: inherit;
        }
      }
    }
  }
`;

export default StyledTitlebar;

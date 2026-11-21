import { BrandLink, HeaderActions, LanguageSwitch, SearchButton, UserAvatar } from "..";
import { ThemeToggle } from "../primitives/action-buttons";
import { Menu } from "../primitives/menu";
import { NavBar } from "../primitives/nav-bar";
import { PreviewActions, PreviewBrand, PreviewCanvas, PreviewContent, PreviewNav } from "../preview-primitives";
import type { HeaderLayoutDefinition } from "../layout-types";

const PREVIEW_ITEMS = ["Home", "Timeline", "Moments"];

/**
 * 居中布局：品牌独立占一行并居中，导航在下一行居中，操作区左右对称分布。
 * 与 classic（品牌靠左、导航居中）的区别是整块头部围绕页面中轴堆叠。
 */
export const centeredLayoutDefinition: HeaderLayoutDefinition = {
  kind: "top",
  renderDesktop({ children, profile, siteConfig }) {
    return (
      <div className="hidden w-full flex-col items-center gap-2 md:flex">
        <BrandLink
          siteConfig={siteConfig}
          avatarClassName="h-8 w-8 rounded-full"
          titleClassName="text-center"
          descriptionClassName="text-center"
          className="flex flex-row items-center justify-center"
        />
        <div className="relative flex w-full items-center justify-center">
          {/* 左右操作区用绝对定位，保证中间的导航始终相对页面居中 */}
          <div className="absolute left-0 flex items-center gap-1.5">
            {children ? <div className="hidden items-center text-sm t-primary lg:flex">{children}</div> : null}
            <SearchButton plain />
            <ThemeToggle plain />
          </div>
          <div className="scrollbar-none max-w-full overflow-x-auto rounded-full bg-w px-2 shadow-xl shadow-light t-primary rin-glass">
            <div className="flex min-w-max flex-row items-center whitespace-nowrap">
              <NavBar menu={false} itemClassName="whitespace-nowrap px-1.5 py-2 text-[13px] lg:px-3 lg:text-[14px]" />
            </div>
          </div>
          <div className="absolute right-0 flex items-center gap-1.5">
            <LanguageSwitch plain />
            <UserAvatar profile={profile} plain />
          </div>
        </div>
      </div>
    );
  },
  renderMobile({ children, profile, siteConfig }) {
    return (
      <div className="flex w-full flex-col items-center gap-2 md:hidden">
        <BrandLink
          siteConfig={siteConfig}
          compact
          showDescription={false}
          titleClassName="text-center"
          className="flex flex-row items-center justify-center"
        />
        <div className="flex items-center rounded-full bg-w px-2 shadow-xl shadow-light t-primary rin-glass">
          {children ? <div className="mr-1 flex items-center text-sm t-primary">{children}</div> : null}
          <HeaderActions profile={profile} plain className="flex flex-row items-center gap-1" />
          <Menu profile={profile} />
        </div>
      </div>
    );
  },
  renderPreview(data) {
    return (
      <PreviewCanvas className="w-full overflow-hidden rounded-[22px] p-3">
        <div className="flex flex-col items-center gap-2">
          <PreviewBrand data={data} compact />
          <div className="rounded-full bg-white px-3 py-1.5 shadow-lg shadow-black/5 ring-1 ring-black/5 dark:bg-white/[0.08] dark:shadow-black/20 dark:ring-white/10">
            <PreviewNav center items={PREVIEW_ITEMS} themeColor={data.themeColor} />
          </div>
          <PreviewActions minimal themeColor={data.themeColor} />
        </div>
        <PreviewContent />
      </PreviewCanvas>
    );
  },
  renderRouteShell({ header, content, footer }) {
    return (
      <>
        {header}
        {content}
        {footer}
      </>
    );
  },
};

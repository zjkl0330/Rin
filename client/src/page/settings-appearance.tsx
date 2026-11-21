import {
  SearchableSelect,
  SettingsCard,
  SettingsCardBody,
  SettingsCardHeader,
  SettingsCardRow,
  TextArea,
} from "@rin/ui";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import ReactLoading from "react-loading";
import { Button } from "../components/button";
import { FeedCardPreview } from "../components/feed-card-preview";
import { FEED_CARD_VARIANTS, normalizeFeedCardVariant } from "../components/feed-card-options";
import { FEED_LAYOUT_OPTIONS, normalizeFeedLayout } from "../components/feed-layout-options";
import { HeaderLayoutPreview } from "../components/site-header/layout-preview";
import {
  HEADER_BEHAVIOR_OPTIONS,
  HEADER_LAYOUT_OPTIONS,
  normalizeHeaderBehavior,
  normalizeHeaderLayout,
} from "../components/site-header/layout-options";
import { useSettingsDraft } from "../hooks/use-settings-draft";
import { ItemTitle, SaveBar } from "./settings-items";

/** 整合设置只导出/导入这些外观键，避免误带密钥等敏感配置。 */
const APPEARANCE_KEYS = [
  "header.layout",
  "header.behavior",
  "feed.layout",
  "feed.card_variant",
] as const;

type AppearancePreset = {
  version: 1;
  exportedAt: string;
  appearance: Record<(typeof APPEARANCE_KEYS)[number], string>;
};

function buildPreset(values: Record<string, unknown>): AppearancePreset {
  const appearance = {} as AppearancePreset["appearance"];
  for (const key of APPEARANCE_KEYS) {
    appearance[key] = String(values[key] ?? "");
  }
  return { version: 1, exportedAt: new Date().toISOString(), appearance };
}

/** 宽松解析：接受完整 preset，也接受只有 appearance 的对象；忽略未知键。 */
function parsePreset(raw: string): AppearancePreset["appearance"] | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const source = (data.appearance && typeof data.appearance === "object"
      ? data.appearance
      : data) as Record<string, unknown>;
    const result = {} as AppearancePreset["appearance"];
    let any = false;
    for (const key of APPEARANCE_KEYS) {
      if (typeof source[key] === "string") {
        result[key] = source[key];
        any = true;
      }
    }
    return any ? result : null;
  } catch {
    return null;
  }
}

export function SettingsAppearance() {
  const { t } = useTranslation();
  const {
    loading,
    saving,
    draft,
    clientConfig,
    hasUnsavedChanges,
    setConfigValue,
    replaceDraft,
    handleReset,
    handleSave,
    showAlert,
    AlertUI,
  } = useSettingsDraft({ successMessage: "theme.save_success", liveThemeColor: true });

  const [importText, setImportText] = useState("");

  const previewSiteName = String(clientConfig.get("site.name") ?? clientConfig.default("site.name") ?? "Rin");
  const previewSiteAvatar = String(clientConfig.get("site.avatar") ?? clientConfig.default("site.avatar") ?? "");

  const headerLayout = normalizeHeaderLayout(String(clientConfig.get("header.layout") ?? "classic"));
  const headerBehavior = normalizeHeaderBehavior(String(clientConfig.get("header.behavior") ?? "fixed"));
  const feedLayout = normalizeFeedLayout(String(clientConfig.get("feed.layout") ?? "list"));
  const feedCard = normalizeFeedCardVariant(String(clientConfig.get("feed.card_variant") ?? "default"));

  const presetJson = useMemo(() => {
    // 未显式存储的配置键（走默认值的）导出时要用当前实际生效值，
    // 否则会导出空字符串，导入后反而把布局清零。
    const effective = {
      ...draft.clientConfig,
      "header.layout": headerLayout,
      "header.behavior": headerBehavior,
      "feed.layout": feedLayout,
      "feed.card_variant": feedCard,
    };
    return JSON.stringify(buildPreset(effective), null, 2);
  }, [draft.clientConfig, headerLayout, headerBehavior, feedLayout, feedCard]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(presetJson);
      showAlert(t("settings.appearance.copy_success"));
    } catch {
      showAlert(t("settings.appearance.copy_failed"));
    }
  }

  function handleDownload() {
    const blob = new Blob([presetJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rin-appearance.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const appearance = parsePreset(importText);
    if (!appearance) {
      showAlert(t("settings.appearance.import_invalid"));
      return;
    }
    replaceDraft((current) => ({
      ...current,
      clientConfig: { ...current.clientConfig, ...appearance },
    }));
    setImportText("");
    showAlert(t("settings.appearance.import_success"));
  }

  return (
    <div className="w-full">
      <Helmet><title>{t("settings.appearance.title")} - Rin</title></Helmet>
      <main className="w-full rounded-2xl bg-w" aria-label={t("settings.appearance.title")}>
        <div className="flex flex-col items-start space-y-2 pb-24">
          {(loading || saving) && <ReactLoading width="1em" height="1em" type="spin" color="rgb(var(--theme-rgb))" />}

          <ItemTitle title={t("settings.appearance.title")} />
          <p className="w-full text-sm t-secondary">{t("settings.appearance.desc")}</p>

          <div className="w-full">
            <SettingsCard>
              <SettingsCardRow
                header={
                  <SettingsCardHeader
                    title={t("settings.header_layout.title")}
                    description={t("settings.header_layout.desc")}
                  />
                }
                action={
                  <SearchableSelect
                    value={headerLayout}
                    onChange={(value) => setConfigValue("client", "header.layout", value)}
                    options={HEADER_LAYOUT_OPTIONS.map((value) => ({
                      value,
                      label: t(`settings.header_layout.options.${value}`),
                    }))}
                    placeholder={t("settings.header_layout.title")}
                    emptyLabel={t("no_more")}
                    searchable={false}
                  />
                }
              />
              <SettingsCardBody>
                <div className="grid gap-3 md:grid-cols-2">
                  {HEADER_LAYOUT_OPTIONS.map((value) => (
                    <HeaderLayoutPreview
                      key={value}
                      data={{ avatar: previewSiteAvatar, name: previewSiteName, themeColor: "" }}
                      layout={value}
                      selected={headerLayout === value}
                      title={t(`settings.header_layout.options.${value}`)}
                      description={t(`settings.header_layout.preview.${value}`)}
                      onClick={() => setConfigValue("client", "header.layout", value)}
                    />
                  ))}
                </div>
              </SettingsCardBody>
              <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
                <SettingsCardRow
                  header={<SettingsCardHeader title={t("settings.header_behavior.title")} description={t("settings.header_behavior.desc")} />}
                  action={
                    <SearchableSelect
                      value={headerBehavior}
                      onChange={(value) => setConfigValue("client", "header.behavior", value)}
                      options={HEADER_BEHAVIOR_OPTIONS.map((value) => ({
                        value,
                        label: t(`settings.header_behavior.options.${value}`),
                      }))}
                      placeholder={t("settings.header_behavior.title")}
                      emptyLabel={t("no_more")}
                      searchable={false}
                    />
                  }
                />
              </div>
              <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
                <SettingsCardRow
                  header={<SettingsCardHeader title={t("settings.feed_layout.title")} description={t("settings.feed_layout.desc")} />}
                  action={
                    <SearchableSelect
                      value={feedLayout}
                      onChange={(value) => setConfigValue("client", "feed.layout", value)}
                      options={FEED_LAYOUT_OPTIONS.map((value) => ({
                        value,
                        label: t(`settings.feed_layout.options.${value}`),
                      }))}
                      placeholder={t("settings.feed_layout.title")}
                      emptyLabel={t("no_more")}
                      searchable={false}
                    />
                  }
                />
              </div>
              <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
                <SettingsCardRow
                  header={<SettingsCardHeader title={t("settings.feed_card.title")} description={t("settings.feed_card.desc")} />}
                  action={
                    <SearchableSelect
                      value={feedCard}
                      onChange={(value) => setConfigValue("client", "feed.card_variant", value)}
                      options={FEED_CARD_VARIANTS.map((value) => ({
                        value,
                        label: t(`settings.feed_card.options.${value}`),
                      }))}
                      placeholder={t("settings.feed_card.title")}
                      emptyLabel={t("no_more")}
                      searchable={false}
                    />
                  }
                />
                <SettingsCardBody>
                  <div className="grid gap-3 md:grid-cols-2">
                    {FEED_CARD_VARIANTS.map((value) => (
                      <FeedCardPreview
                        key={value}
                        variant={value}
                        selected={feedCard === value}
                        title={t(`settings.feed_card.options.${value}`)}
                        description={t(`settings.feed_card.preview.${value}`)}
                        onClick={() => setConfigValue("client", "feed.card_variant", value)}
                      />
                    ))}
                  </div>
                </SettingsCardBody>
              </div>
            </SettingsCard>
          </div>

          <ItemTitle title={t("settings.appearance.export_title")} />
          <div className="w-full">
            <SettingsCard>
              <SettingsCardBody>
                <p className="mb-3 text-sm t-secondary">{t("settings.appearance.export_desc")}</p>
                <pre className="mb-3 max-h-52 overflow-auto rounded-xl bg-black/5 p-3 text-xs dark:bg-white/5">{presetJson}</pre>
                <div className="flex flex-wrap gap-2">
                  <Button title={t("settings.appearance.copy")} onClick={handleCopy} disabled={loading} />
                  <Button title={t("settings.appearance.download")} onClick={handleDownload} disabled={loading} />
                </div>
                <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
                  <p className="mb-2 text-sm t-secondary">{t("settings.appearance.import_desc")}</p>
                  <TextArea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={t("settings.appearance.import_placeholder")}
                    rows={5}
                  />
                  <div className="mt-2">
                    <Button title={t("settings.appearance.import")} onClick={handleImport} disabled={loading || !importText.trim()} />
                  </div>
                </div>
              </SettingsCardBody>
            </SettingsCard>
          </div>

          {hasUnsavedChanges && (
            <SaveBar
              message={t("theme.unsaved_changes")}
              saving={saving}
              loading={loading}
              onReset={handleReset}
              onSave={handleSave}
            />
          )}
        </div>
      </main>
      <AlertUI />
    </div>
  );
}

export default SettingsAppearance;

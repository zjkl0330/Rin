import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { buildServerConfigResponse, getClientConfigWithDefaults, persistRegularConfig, resolveWebhookConfig } from "../config-helpers";
import { cleanupTestDB, createMockDB } from "../../../tests/fixtures";

describe("buildServerConfigResponse", () => {
    let sqlite: Database;

    beforeEach(async () => {
        const mockDB = createMockDB();
        sqlite = mockDB.sqlite;
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    it("stringifies object-based webhook template values", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>([
                    ["webhook.headers", { "X-Event": "{{event}}" }],
                    ["webhook.body_template", { content: "{{message}}" }],
                ]);
            },
            async set() {},
            async save() {},
        });

        expect(response["webhook.headers"]).toBe('{"X-Event":"{{event}}"}');
        expect(response["webhook.body_template"]).toBe('{"content":"{{message}}"}');
    });

    it("uses WEBHOOK_URL env as fallback when webhook_url is not stored", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>();
            },
            async set() {},
            async save() {},
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(response["webhook_url"]).toBe("https://env.example.com/webhook");
        expect(response["WEBHOOK_URL"]).toBe("https://env.example.com/webhook");
    });

    it("prefers stored webhook_url over WEBHOOK_URL env fallback", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>([
                    ["webhook_url", "https://stored.example.com/webhook"],
                ]);
            },
            async set() {},
            async save() {},
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(response["webhook_url"]).toBe("https://stored.example.com/webhook");
    });
});

describe("getClientConfigWithDefaults", () => {
    const emptyEnv = {
        NAME: "",
        DESCRIPTION: "",
        AVATAR: "",
        PAGE_SIZE: "",
    };

    function clientConfigWith(entries: [string, unknown][]) {
        return {
            async all() {
                return new Map<string, unknown>(entries);
            },
            async set() {},
            async save() {},
        };
    }

    it("normalizes a deserialized tools array back to a JSON string", async () => {
        const config = await getClientConfigWithDefaults(
            clientConfigWith([
                ["tools", [{ id: "chat", name: "Chat", url: "https://chat.example.com/" }]],
            ]),
            emptyEnv as any,
        );

        expect(config["tools"]).toBe('[{"id":"chat","name":"Chat","url":"https://chat.example.com/"}]');
    });

    it("leaves an already-string tools value untouched", async () => {
        const stored = '[{"id":"chat","name":"Chat","url":"https://chat.example.com/"}]';
        const config = await getClientConfigWithDefaults(
            clientConfigWith([["tools", stored]]),
            emptyEnv as any,
        );

        expect(config["tools"]).toBe(stored);
    });

    it("falls back to the default page size when unset", async () => {
        const config = await getClientConfigWithDefaults(clientConfigWith([]), emptyEnv as any);

        expect(config["site.page_size"]).toBe(5);
    });
});

describe("persistRegularConfig", () => {
    it("uses setQuick per key and never triggers a full-table save()", async () => {
        // 全表 save() 会对每个键发一次 D1 写：33 个键 ≈ 20s。
        // 逐键 setQuick 只发单行 upsert，写入量与键数成正比但无全表重刷。
        const quickWrites: [string, unknown][] = [];
        let fullSaves = 0;
        const config = {
            async all() { return new Map<string, unknown>(); },
            async set() { throw new Error("set() should not be used when setQuick exists"); },
            async setQuick(key: string, value: unknown) { quickWrites.push([key, value]); },
            async save() { fullSaves += 1; },
        };

        await persistRegularConfig(config as any, {
            "site.name": "bai",
            "theme.scheme": "ocean",
        });

        expect(quickWrites).toEqual([["site.name", "bai"], ["theme.scheme", "ocean"]]);
        expect(fullSaves).toBe(0);
    });

    it("falls back to set(key, ..., false) + save() when setQuick is unavailable", async () => {
        const writes: [string, unknown, boolean][] = [];
        let fullSaves = 0;
        const config = {
            async all() { return new Map<string, unknown>(); },
            async set(key: string, value: unknown, save?: boolean) { writes.push([key, value, !!save]); },
            async save() { fullSaves += 1; },
        };

        await persistRegularConfig(config as any, { "site.name": "bai" });

        expect(writes).toEqual([["site.name", "bai", false]]);
        expect(fullSaves).toBe(1);
    });
});

describe("resolveWebhookConfig", () => {
    it("prefers stored webhook_url over the legacy key and env fallback", async () => {
        const config = await resolveWebhookConfig({
            async get(key: string) {
                if (key === "webhook_url") {
                    return "https://stored.example.com/webhook";
                }
                if (key === "WEBHOOK_URL") {
                    return "https://legacy.example.com/webhook";
                }
                return undefined;
            },
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(config.webhookUrl).toBe("https://stored.example.com/webhook");
    });

    it("uses body overrides before stored config values", async () => {
        const config = await resolveWebhookConfig({
            async get(key: string) {
                if (key === "webhook_url") {
                    return "https://stored.example.com/webhook";
                }
                if (key === "webhook.method") {
                    return "POST";
                }
                return undefined;
            },
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        }, {
            webhook_url: "https://override.example.com/webhook",
            "webhook.method": "GET",
        });

        expect(config.webhookUrl).toBe("https://override.example.com/webhook");
        expect(config.webhookMethod).toBe("GET");
    });
});

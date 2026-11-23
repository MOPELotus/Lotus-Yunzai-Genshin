import { expect, test } from "bun:test";
import { createCharacterVoiceCommands, type VoiceContext } from "./command.ts";
import { createVoiceSource, parseCharacterVoices, parseVoiceCatalog } from "./source.ts";

const officialAudio = "https://uploadstatic.mihoyo.com/ys-obc/2022/05/12/1234/";
const a = officialAudio + "aa.mp3", b = officialAudio + "bb.mp3";
const clips = (audio: string, name = "初次见面…") => [{ name, content: "<b>你好</b><br />呀", audio_url: audio }];
const tab = (tab_name: string, table: ReturnType<typeof clips>) => ({ tab_name, table });
const fixture = (list = [tab("汉语", clips(a)), tab("日语", clips(b))]) => ({ retcode: 0,
  data: { page: { id: "55", name: "可莉", modules: [{ components: [{ component_id: "role_voice", data: JSON.stringify({ list }) }] }] } },
});
const index = { retcode: 0, data: { list: [{ children: [
  { name: "角色", list: [{ title: "可莉", content_id: 55 }, { title: "未发行【预告】", content_id: 57 }] },
  { name: "武器", list: [{ title: "可莉", content_id: 999 }] },
] }] } };

test("原神语音仅核官方同角色与同序号标题，忽略非角色索引和失配音轨", () => {
  expect([...parseVoiceCatalog(index)]).toEqual([["可莉", "55"]]);
  expect(parseCharacterVoices(fixture(), "56", "可莉")).toBeUndefined();
  expect(parseCharacterVoices(fixture(), "55", "旅行者")).toBeUndefined();
  const valid = parseCharacterVoices(fixture(), "55", "可莉");
  expect(valid?.lines[0]?.clips).toEqual({ 汉语: { audio: a, text: "你好\n呀" }, 日语: { audio: b, text: "你好\n呀" } });
  const wrong = parseCharacterVoices(fixture([tab("汉语", clips(a)), tab("日语", clips(b, "无对应条目")),
    tab("英语", clips("https://example.com/a.mp3"))]), "55", "可莉");
  expect(Object.keys(wrong?.lines[0]?.clips ?? {})).toEqual(["汉语"]);
});

test("原神语音仅确认列表后承接严格引用，保留同房间原编号与语种", async () => {
  const lifecycle = new AbortController();
  const connection = new AbortController();
  const calls: string[] = [];
  const sends: Parameters<VoiceContext["reply"]>[0][] = [];
  const transport = (async (input, init) => {
    const uri = String(input);
    calls.push(uri);
    expect(init).toMatchObject({ redirect: "error", credentials: "omit" });
    if (uri.includes("channel_id")) return Response.json(index);
    if (uri.includes("entry_page_id=55")) return Response.json(fixture());
    return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(60)]), { headers: { "content-type": "audio/mpeg" } });
  }) as typeof fetch;
  let time = Date.parse("2026-11-24T11:30:00+08:00");
  const feature = createCharacterVoiceCommands(lifecycle.signal, {
    source: createVoiceSource(transport, () => time),
    render: async () => ({ png: Buffer.from("list"), engine: {} as never }),
    now: () => time,
    resolve: async (name) => name === "火花骑士" ? { name: "可莉" } : undefined,
  });
  const base: VoiceContext = { message_type: "group", self_id: 99, user_id: 42, group_id: 81,
    groupActivitySignal: connection.signal, reply: async message => { sends.push(message); return true; } };
  const quote: VoiceContext = { ...base, user_id: 43, reply_id: -5, message: [{ type: "reply", id: -5 }],
    lookupMediaReply: async () => ({ user_id: 99, message: [{ type: "image" }] }) };
  const result = await feature.fallback("火花骑士语音", base);
  if (!result || typeof result !== "object" || !("type" in result) || result.type !== "delivery") throw Error("未返回确认型回执");
  expect(feature.features("日语1", quote)).toBe(false);
  await result.onDelivered(-5);
  expect(feature.features("1日语", { ...quote, group_id: 82 })).toBe(false);
  expect(feature.features("1日语", { ...quote, self_id: 98 })).toBe(false);
  expect(feature.features("1日语", { ...quote, message: [{ type: "reply", id: -6 }] })).toBe(false);
  expect(await feature.fallback("1日语", { ...quote, lookupMediaReply: async () => ({ user_id: 57, message: [{ type: "image" }] }) })).toBeUndefined();
  expect(calls).toHaveLength(2);
  expect(await feature.fallback("日语1", quote)).toEqual([]);
  expect(calls.at(-1)).toBe(b);
  expect(sends).toHaveLength(2);
  expect(sends[0]).toBe("可莉 · 1. 初次见面… · 日语\n你好\n呀");
  expect(sends[1]).toMatchObject({ type: "record" });
  expect(await feature.fallback("英语1", quote)).toBe("该语音暂无英语音频。");
  time = Date.parse("2026-11-25T04:19:59+08:00");
  expect(await feature.fallback("1", quote)).toEqual([]);
  time += 1_000;
  expect(await feature.fallback("1", quote)).toContain("已过期");
  expect(await feature.fallback("#可莉语音1", base)).toEqual([]);
  expect(calls.at(-1)).toBe(a);
  expect(await feature.fallback("#清空语音缓存", base)).toContain("只有当前机器人的主人");
  expect(await feature.fallback("#清空语音缓存", { ...base, isBotMaster: () => true })).toContain("已清理");
  expect(feature.features("1", quote)).toBe(false);
  connection.abort();
  expect(await feature.fallback("#可莉1语音", base)).toBeUndefined();
});

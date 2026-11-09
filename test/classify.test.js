import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  HOMEWORK,
  LECTURE,
  OTHER,
  parseCoolUrl,
  classifyByKeywords,
  classifyByFolderPath,
  classifyByFilename,
  classifyByUrl,
  findFileId,
  classifyDownload,
} from "../lib/classify.js";

const C = "https://cool.ntu.edu.tw";

describe("parseCoolUrl", () => {
  test("非 COOL 網址回傳 null", () => {
    for (const u of [
      undefined,
      "",
      "not a url",
      "https://example.com/courses/1/files/2",
      "https://cool.ntu.edu.tw.evil.com/courses/1",
      "https://evil-cool.ntu.edu.tw/courses/1",
      "http://cool.ntu.edu.tw/courses/1", // 非 https
      "https://cool.ntu.edu.tw:8443/courses/1", // 不同 port
    ]) {
      assert.equal(parseCoolUrl(u), null, String(u));
    }
  });

  test("課程檔案下載", () => {
    assert.deepEqual(parseCoolUrl(`${C}/courses/12345/files/678/download?download_frd=1`), {
      courseId: "12345",
      section: "files",
      fileId: "678",
      folderPath: null,
    });
  });

  test("沒有 /courses/ 的檔案下載（verifier 連結）", () => {
    assert.deepEqual(parseCoolUrl(`${C}/files/678/download?verifier=abc&wrap=1`), {
      courseId: null,
      section: null,
      fileId: "678",
      folderPath: null,
    });
  });

  test("作業頁面", () => {
    const p = parseCoolUrl(`${C}/courses/1/assignments/99`);
    assert.equal(p.section, "assignments");
    assert.equal(p.fileId, null);
  });

  test("作業繳交附件 ?download=", () => {
    const p = parseCoolUrl(`${C}/courses/1/assignments/2/submissions/3?download=444`);
    assert.equal(p.section, "assignments");
    assert.equal(p.fileId, "444");
  });

  test("課程大綱 /assignments/syllabus 不算作業", () => {
    assert.equal(parseCoolUrl(`${C}/courses/1/assignments/syllabus`).section, "syllabus");
  });

  test("檔案資料夾頁面會解碼中文路徑", () => {
    const p = parseCoolUrl(`${C}/courses/1/files/folder/${encodeURIComponent("講義")}/Week%203?preview=5`);
    assert.deepEqual(p.folderPath, ["講義", "Week 3"]);
    assert.equal(p.fileId, null);
  });

  test("壞掉的 percent-encoding 不會丟例外", () => {
    const p = parseCoolUrl(`${C}/courses/1/files/folder/%E4%BA`);
    assert.deepEqual(p.folderPath, ["%E4%BA"]);
  });

  test("courseId 必須是數字", () => {
    assert.equal(parseCoolUrl(`${C}/courses/abc/files/1`).courseId, null);
  });

  test("files 後面不是數字就不是 fileId", () => {
    assert.equal(parseCoolUrl(`${C}/courses/1/files/folder/2`).fileId, null);
    assert.equal(parseCoolUrl(`${C}/courses/1/files?download=abc`).fileId, null);
  });
});

describe("classifyByKeywords", () => {
  const cases = [
    // 作業
    ["HW1", HOMEWORK],
    ["hw_02_spec", HOMEWORK],
    ["Homework 3", HOMEWORK],
    ["Assignment2", HOMEWORK],
    ["assignments", HOMEWORK],
    ["Lab 4", HOMEWORK],
    ["lab05-handin", HOMEWORK],
    ["PSet3", HOMEWORK],
    ["Problem Set 1", HOMEWORK],
    ["problem_set_2", HOMEWORK],
    ["作業三", HOMEWORK],
    ["第二次習題", HOMEWORK],
    ["ＨＷ１", HOMEWORK], // 全形
    // 講義
    ["Lecture 3", LECTURE],
    ["lec01", LECTURE],
    ["Slides", LECTURE],
    ["week3_slide", LECTURE],
    ["Ch3", LECTURE],
    ["chapter_10", LECTURE],
    ["Handouts", LECTURE],
    ["講義", LECTURE],
    ["期中投影片", LECTURE],
    ["上課簡報", LECTURE],
    // 判斷不出來
    ["Week 3", null],
    ["syllabus", null],
    ["course files", null],
    ["show", null], // 不能因為含 "hw" 子字串就判斷
    ["label", null], // 不能因為含 "lab"
    ["collaboration", null],
    ["research3", null], // "ch3" 前面接字母
    ["electronics", null], // "lec" 前面接字母
    ["unassigned", null],
    ["", null],
    // 兩種都命中 → 無法判斷
    ["lecture3_hw1", null],
    ["講義與作業", null],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(classifyByKeywords(input), expected);
    });
  }

  test("非字串", () => {
    assert.equal(classifyByKeywords(undefined), null);
    assert.equal(classifyByKeywords(42), null);
  });
});

describe("classifyByFolderPath", () => {
  test("Canvas full_name 字串", () => {
    assert.equal(classifyByFolderPath("course files/講義/Week 3"), LECTURE);
    assert.equal(classifyByFolderPath("course files/Homework/HW1"), HOMEWORK);
    assert.equal(classifyByFolderPath("course files/Week 3"), null);
    assert.equal(classifyByFolderPath("course files"), null);
  });

  test("最深的資料夾優先", () => {
    // 講義資料夾底下的 HW 子資料夾 → 作業
    assert.equal(classifyByFolderPath("course files/Lectures/HW"), HOMEWORK);
    // 子資料夾判斷不出來就往上找
    assert.equal(classifyByFolderPath(["Slides", "2026 Fall", "Week 1"]), LECTURE);
  });

  test("空值", () => {
    assert.equal(classifyByFolderPath(null), null);
    assert.equal(classifyByFolderPath(undefined), null);
    assert.equal(classifyByFolderPath([]), null);
  });
});

describe("classifyByFilename", () => {
  const cases = [
    ["HW1.pdf", HOMEWORK],
    ["hw2_solution.pdf", HOMEWORK],
    ["DSA_Homework3.zip", HOMEWORK],
    ["作業一說明.docx", HOMEWORK],
    ["lab3.ipynb", HOMEWORK],
    ["Lecture01.pdf", LECTURE],
    ["lec_05_trees.pptx", LECTURE],
    ["Ch2-Linked-List.pdf", LECTURE],
    ["week3_slides.pdf", LECTURE],
    ["第三週講義.pdf", LECTURE],
    ["syllabus.pdf", null],
    ["IMG_1234.jpg", null],
    ["report.ppt", null], // 副檔名 ppt 不算關鍵字
    ["midterm.pdf", null],
    ["no-extension", null],
    [".hw", null], // 只有副檔名
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.equal(classifyByFilename(input), expected);
    });
  }
});

describe("classifyByUrl（第 1 層）", () => {
  test("下載網址在 /assignments/ 底下 → 作業", () => {
    assert.equal(
      classifyByUrl({ url: `${C}/courses/1/assignments/2/submissions/3?download=4` }),
      HOMEWORK,
    );
  });

  test("來源頁是作業頁 → 作業", () => {
    assert.equal(
      classifyByUrl({
        url: `${C}/courses/1/files/5/download?download_frd=1`,
        referrer: `${C}/courses/1/assignments/2`,
      }),
      HOMEWORK,
    );
  });

  test("來源頁是作業列表 → 作業", () => {
    assert.equal(classifyByUrl({ url: `${C}/files/5/download`, referrer: `${C}/courses/1/assignments` }), HOMEWORK);
  });

  test("來源頁是課程大綱 → 不判斷", () => {
    assert.equal(
      classifyByUrl({ url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/assignments/syllabus` }),
      null,
    );
  });

  test("來源頁是 Files 的講義資料夾 → 講義", () => {
    assert.equal(
      classifyByUrl({
        url: `${C}/courses/1/files/5/download?download_frd=1`,
        referrer: `${C}/courses/1/files/folder/Lecture%20Slides`,
      }),
      LECTURE,
    );
  });

  test("Files 資料夾名稱判斷不出來 → 不判斷", () => {
    assert.equal(
      classifyByUrl({ url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/files/folder/Week%201` }),
      null,
    );
  });

  test("單元（modules）、頁面（pages）、首頁、公告、討論區 → 不判斷", () => {
    for (const ref of [
      `${C}/courses/1/modules`,
      `${C}/courses/1/modules/items/77`,
      `${C}/courses/1/pages/week-1`,
      `${C}/courses/1`,
      `${C}/courses/1/announcements`,
      `${C}/courses/1/discussion_topics/8`,
      `${C}/courses/1/files`,
    ]) {
      assert.equal(classifyByUrl({ url: `${C}/courses/1/files/5/download`, referrer: ref }), null, ref);
    }
  });

  test("外部網站的網址不會被判斷", () => {
    assert.equal(classifyByUrl({ url: "https://example.com/courses/1/assignments/2" }), null);
  });
});

describe("findFileId", () => {
  test("優先用下載網址，其次來源頁", () => {
    assert.equal(findFileId({ url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/files/9` }), "5");
    assert.equal(findFileId({ url: "https://s3.example.com/x.pdf", referrer: `${C}/courses/1/files/9` }), "9");
    assert.equal(findFileId({ url: `${C}/courses/1/modules` }), null);
  });
});

describe("classifyDownload（三層組合）", () => {
  const never = async () => {
    throw new Error("不應該呼叫 API");
  };

  test("第 1 層命中就不查 API", async () => {
    const r = await classifyDownload(
      { url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/assignments/2`, filename: "lecture.pdf" },
      { lookupFolderPath: never },
    );
    assert.deepEqual(r, { category: HOMEWORK, source: "url" });
  });

  test("第 2 層：API 回傳的資料夾判斷得出來", async () => {
    const calls = [];
    const r = await classifyDownload(
      { url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/modules`, filename: "hw1.pdf" },
      {
        lookupFolderPath: async (id) => {
          calls.push(id);
          return "course files/講義";
        },
      },
    );
    // 資料夾比檔名可靠：即使檔名像作業，仍以資料夾為準
    assert.deepEqual(r, { category: LECTURE, source: "api" });
    assert.deepEqual(calls, ["5"]);
  });

  test("第 2 層判斷不出來 → 第 3 層檔名", async () => {
    const r = await classifyDownload(
      { url: `${C}/courses/1/files/5/download`, referrer: `${C}/courses/1/modules`, filename: "hw1.pdf" },
      { lookupFolderPath: async () => "course files/Week 1" },
    );
    assert.deepEqual(r, { category: HOMEWORK, source: "filename" });
  });

  test("API 失敗（丟例外或回傳 null）→ 第 3 層", async () => {
    const item = { url: `${C}/courses/1/files/5/download`, filename: "Lecture2.pdf" };
    assert.deepEqual(
      await classifyDownload(item, {
        lookupFolderPath: async () => {
          throw new Error("401");
        },
      }),
      { category: LECTURE, source: "filename" },
    );
    assert.deepEqual(await classifyDownload(item, { lookupFolderPath: async () => null }), {
      category: LECTURE,
      source: "filename",
    });
  });

  test("沒有 fileId 就不查 API", async () => {
    const r = await classifyDownload(
      { url: `${C}/courses/1/modules/items/3`, filename: "x.pdf" },
      { lookupFolderPath: never },
    );
    assert.deepEqual(r, { category: OTHER, source: "none" });
  });

  test("沒注入 lookupFolderPath（關閉 API）", async () => {
    const r = await classifyDownload({ url: `${C}/courses/1/files/5/download`, filename: "slides.pdf" });
    assert.deepEqual(r, { category: LECTURE, source: "filename" });
  });

  test("全部判斷不出來 → 其他", async () => {
    const r = await classifyDownload(
      { url: `${C}/courses/1/files/5/download`, filename: "syllabus.pdf" },
      { lookupFolderPath: async () => "course files" },
    );
    assert.deepEqual(r, { category: OTHER, source: "none" });
  });
});

const axios = require("axios");
const cheerio = require("cheerio");
const jsonfile = require("jsonfile");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
require("dayjs/locale/zh-tw");
dayjs.extend(relativeTime);
dayjs.locale("zh-tw");
let count = 0;
const startTime = dayjs();
const fileUrl = "./data.json";

async function start() {
  console.log("開始時間", dayjs().format("MM/DD HH:mm:ss"));
  const Options = await getHeader();
  const targetApi =
    "https://rent.591.com.tw/home/search/rsList?is_new_list=1&type=1&kind=2&searchtype=1&region=8&hasimg=1&not_cover=1&section=104,101&rentprice=4000,6600";
  let totalCount = await getList(targetApi, Options);
  let currCount = 0;
  console.log("總比數:", totalCount);
  while (totalCount > currCount) {
    const tempDetailList = await getList(targetApi, Options, currCount);
    currCount += 30;
    await delay(1500);
    await asyncForEach(tempDetailList, getDetail);
  }
  console.log(
    "結束時間",
    dayjs().format("MM/DD HH:mm:ss"),
    "耗時:",
    formatAfterTime()
  );
}

async function getHeader() {
  let Token;
  let Cookie;
  await axios
    .get("https://rent.591.com.tw/")
    .then((res) => {
      const $ = cheerio.load(res.data, null, false);
      Cookie = res.headers["set-cookie"].join(";");
      Token = $("meta[name=csrf-token]").attr("content");
      res.data = "";
    })
    .catch((e) => console.log(e, "清單列錯誤"));
  return {
    headers: {
      Referer: "rent.591.com.tw",
      "X-CSRF-TOKEN": Token,
      Cookie,
    },
  };
}

async function getList(api, Options, row) {
  const url = !isNaN(row) ? api + "&firstRow=" + row : api;
  let totalCount;
  let list;
  await axios
    .get(url, Options)
    .then((res) => {
      totalCount = +res.data.records.replace(",", "");
      list = res.data.data.data;
    })
    .catch((e) => console.log(e));
  if (isNaN(row)) return totalCount;
  return list;
}

async function getDetail(simpleData) {
  const id = simpleData["post_id"];
  const readData = await jsonfile.readFile(fileUrl);
  const rule = await ruleFun(simpleData, readData);
  ++count;
  if (rule) {
    let data = readData;
    data.push(await requestDetail(id));
    await jsonfile.writeFile(fileUrl, data);
    await delay(500);
    logDetail(count, id, rule)
  }
  

  async function ruleFun(simpleData, readData) {
    let ruleArray = [false, false];
    ruleArray[0] = !readData.find((e) => e.id === id);
    ruleArray[1] = (function () {
      const updateTime = simpleData["updatetime"] * 1000;
      const yesterday = dayjs().subtract(2, "day");
      return dayjs(updateTime).isAfter(yesterday);
    })();

    return ruleArray.every((e) => e);
  }

  async function requestDetail(id) {
    const detailUrl = `https://rent.591.com.tw/rent-detail-${id}.html`;
    const coordUrl = `https://rent.591.com.tw/map-houseRound.html?type=1&post_id=${id}&detail=detail&version=1`;
    const detail = axios.get(detailUrl);
    const coord = axios.get(coordUrl);
    let detailData = {};
    await Promise.all([detail, coord])
      .then((result) => {
        const detailBody$ = cheerio.load(result[0].data, {
          xmlMode: true,
        });
        const coordBody$ = cheerio.load(result[1].data, null, false);

        // 租金
        const price = +detailBody$(".detailInfo.clearfix .price.clearfix i")
          .text()
          .replace(",", "")
          .replace(/\W{4}$/, "");
        // 座標
        const coord = coordBody$(".propMapBarMap iframe[frameborder=0]")
          .attr("src")
          .replace("//maps.google.com.tw/maps?f=q&hl=zh-TW&q=", "")
          .replace("&z=17&output=embed", "")
          .split(",");
        // 照片
        const phots = Array.from(detailBody$(".leftBox li img")).map((e) =>
          detailBody$(e).attr("src").replace("125x85", "765x517")
        );
        // 管理費
        const HOA = +detailBody$(".clearfix.labelList.labelList-1 li .two")
          .eq(2)
          .text()
          .replace("：", "")
          .replace(/\D{3}$/, "");
        // 租金+管理費
        const totalPrice = price + (isNaN(HOA) ? 0 : HOA);
        console.log(coord, HOA, totalPrice);
        detailData = {
          id,
          price,
          coord,
          phots,
          HOA,
          totalPrice,
        };
      })
      .catch((e) => console.log(e.response, "詳細頁錯誤", id));
    return detailData;
  }

  function logDetail(count, id, ignore) {
    const isIgnore = ignore ? "" : " 跳過";
    console.log(count, "id:", id, "經過時間:", formatAfterTime(), isIgnore);
  }
}

async function asyncForEach(array, callback) {
  for (let i = 0; i < array.length; i++) {
    await callback(array[i]);
  }
}

function formatAfterTime() {
  const diffSecond = dayjs().diff(startTime, "s");
  const s = diffSecond % 60;
  const m = parseInt(diffSecond / 60);
  return m + " 分 " + s + " 秒";
}

function delay(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s);
  });
}

start();

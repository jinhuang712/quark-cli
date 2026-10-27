import { waitShare } from "./settle.js";
import { EXPIRED_TYPE, makeCode, ok, raw, rejection, waitTask } from "./shares.js";

// Creates one share link for `nodes` and waits until Quark lists it. `days` is 1, 7, 30 or 0
// (forever); `withCode` adds a 4-character passcode. Returns Quark's answer plus the ids.
export async function createShare(page, nodes, { days, withCode }) {
  const passcode = withCode ? makeCode() : undefined;
  const created = await raw(page, "POST", "/share", {
    body: {
      fid_list: nodes.map((n) => n.fid),
      title: nodes[0].file_name,
      url_type: passcode ? 2 : 1,
      expired_type: EXPIRED_TYPE[days],
      ...(passcode && { passcode }),
    },
  });
  if (!ok(created)) throw rejection("创建分享", created);
  const task = await waitTask(page, created.data.task_id);
  await waitShare(page, task.share_id, true);
  const info = await raw(page, "POST", "/share/password", { body: { share_id: task.share_id } });
  if (!ok(info)) throw rejection("读取分享链接", info);
  return { ...info.data, task_id: created.data.task_id, share_id: task.share_id };
}

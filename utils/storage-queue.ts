/**
 * 存储写队列：
 * chrome.storage.local 没有事务：两个并发的「读整表 → 合并 → 写回」会互相覆盖，后写者赢。
 * 把同类写操作排进同一条 promise 链，保证每次「读」都看得见上一次「写」的结果。
 */
export function createWriteQueue() {
  let chain: Promise<any> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.catch(() => {}).then(task);
    chain = next;
    return next;
  };
}

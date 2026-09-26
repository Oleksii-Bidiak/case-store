import { downloadCsv } from "./download-csv";

/**
 * TASK-691: the order export opens in Excel on Windows only with a UTF-8 BOM,
 * and the browser strips the server's copy while decoding the response — so
 * the saved file gets it here, exactly once. Checked on bytes: a text decode
 * would strip the very BOM under test.
 */
describe("downloadCsv (orders)", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => "blob:mock-url");
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    jest.restoreAllMocks();
  });

  async function savedBytes(csv: string): Promise<number[]> {
    downloadCsv(csv, "orders.csv");
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }

  it("starts the saved file with the UTF-8 BOM", async () => {
    const bytes = await savedBytes("orderNumber,guestName\r\nABC,Олена");
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.slice(3, 14)).toEqual(Array.from(Buffer.from("orderNumber")));
  });

  it("does not double a BOM that survived the transport", async () => {
    const bytes = await savedBytes("﻿orderNumber");
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.slice(3, 6)).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it("clicks a temporary anchor with the file name and cleans it up", async () => {
    await savedBytes("a,b");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

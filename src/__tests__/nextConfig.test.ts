import nextConfig from "../../next.config";
import { PHOTO_MAX_BYTES } from "@/lib/contacts/photo";

// A submit carries at most one photo as multipart binary.
// An unchanged photo is read back on the server, so nothing large is bound to
// the action or echoed into the page.
const MULTIPART_OVERHEAD = 64 * 1024;
const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;
const boundDataUrlBytes = base64Length(
  "data:image/jpeg;base64,".length + base64Length(PHOTO_MAX_BYTES),
);

describe("next.config serverActions.bodySizeLimit", () => {
  const bodySizeLimit = nextConfig.experimental?.serverActions?.bodySizeLimit;

  it("is a byte count", () => {
    expect(typeof bodySizeLimit).toBe("number");
  });

  it("fits one maximum replacement file plus multipart overhead", () => {
    expect(bodySizeLimit as number).toBeGreaterThanOrEqual(
      PHOTO_MAX_BYTES + MULTIPART_OVERHEAD,
    );
  });

  it("is not sized for a second copy of the photo", () => {
    // Guards against reintroducing a bound data URL and paying for it here.
    expect(bodySizeLimit as number).toBeLessThan(
      PHOTO_MAX_BYTES + boundDataUrlBytes,
    );
    expect(bodySizeLimit as number).toBeLessThan(PHOTO_MAX_BYTES * 1.5);
  });
});

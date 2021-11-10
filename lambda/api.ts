import { API } from "homebridge-lg-thinq/dist/lib/API";

export class ThinQApi extends API {
  public httpClient: API["httpClient"];

  get defaultHeaders() {
    return super.defaultHeaders;
  }

  get baseUrl() {
      return this._gateway?.thinq2_url;
  }
}

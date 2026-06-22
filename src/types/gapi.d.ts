/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace gapi {
  function load(api: string, callback: () => void): void;
  namespace client {
    function init(config: { discoveryDocs?: string[] }): Promise<void>;
    namespace drive {
      namespace files {
        function list(params: Record<string, any>): Promise<{ result: any }>;
        function get(params: Record<string, any>): Promise<{ result: any; body: string }>;
      }
      namespace drives {
        function list(params: Record<string, any>): Promise<{ result: any }>;
      }
    }
  }
}

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: any) => void;
      }): { requestAccessToken: (opts?: any) => void };

      function revoke(token: string, callback: () => void): void;
    }
  }
}

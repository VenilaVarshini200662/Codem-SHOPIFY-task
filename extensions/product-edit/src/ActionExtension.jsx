import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { APP_HANDLE } from "./config";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {
    i18n,
    close,
    data,
    extension: { target },
  } = shopify;

  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getProductHandle() {
      try {
        const productId = data?.selected?.[0]?.id;

        if (!productId) {
          console.error("No product selected");
          setLoading(false);
          return;
        }

        const query = {
          query: `
            query Product($id: ID!) {
              product(id: $id) {
                handle
              }
            }
          `,
          variables: {
            id: productId,
          },
        };

        const response = await fetch(
          "shopify:admin/api/graphql.json",
          {
            method: "POST",
            body: JSON.stringify(query),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch product");
        }

        const result = await response.json();

        const productHandle =
          result?.data?.product?.handle || "";

        setHandle(productHandle);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    getProductHandle();
  }, [data?.selected]);

  const openEditor = () => {
    if (!handle) return;

    const editUrl =
      `/admin/apps/${APP_HANDLE}/app/products/${handle}/edit`;

    window.open(editUrl, "_top");

    close();
  };

  return (
    <s-admin-action>
      <s-stack direction="block">
        <s-text type="strong">
          {i18n.translate("welcome", { target })}
        </s-text>

        {loading ? (
          <s-text>Loading product...</s-text>
        ) : (
          <s-text>
            Product Handle: {handle || "Not found"}
          </s-text>
        )}
      </s-stack>

      <s-button
        slot="primary-action"
        onClick={openEditor}
        disabled={!handle}
      >
        Open Product Editor
      </s-button>

      <s-button
        slot="secondary-actions"
        onClick={() => close()}
      >
        Close
      </s-button>
    </s-admin-action>
  );
}
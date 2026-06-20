import { Form, useLoaderData, useActionData, useNavigation, useFetcher } from "react-router";
import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import "../product-edit.css";
import PropTypes from "prop-types";

const PRODUCT_QUERY = `
  query ProductByHandle($handle: String!) {
    products(first: 1, query: $handle) {
      nodes {
        id
        handle
        title
        vendor
        productType
        descriptionHtml
        status
        tags
        variants(first: 1) {
          nodes {
            id
            sku
          }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        vendor
        productType
        descriptionHtml
        status
        tags
      }
      userErrors { field message }
    }
  }
`;

const VARIANTS_BULK_UPDATE_MUTATION = `
  mutation VariantsBulkUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    variantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
        variants(first: 1) { nodes { id sku } }
      }
      userErrors { field message }
    }
  }
`;

const CHECK_SKU_UNIQUENESS_QUERY = `
  query CheckSkuUniqueness($sku: String!) {
    products(first: 2, query: $sku) {
      nodes { id title }
    }
  }
`;

const SIBLINGS_METAFIELD_QUERY = `
  query ProductSiblingsMetafield($handle: String!) {
    products(first: 1, query: $handle) {
      nodes {
        id
        handle
        metafield(namespace: "codem", key: "sibling_products") {
          id
          key
          value
          type
        }
      }
    }
  }
`;

const SIBLING_PRODUCTS_QUERY = `
  query SiblingProducts($queryString: String!) {
    products(first: 50, query: $queryString) {
      nodes {
        id
        handle
        title
        vendor
        productType
        status
        featuredImage { url }
        variants(first: 1) { nodes { sku } }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key value }
      userErrors { field message }
    }
  }
`;

const ERROR_MESSAGES = {
  E01: "Handle is required to load product",
  E02: "Handle is required to update product",
  E03: "Unauthorized session",
  E04: "Product not found",
  E05: "Invalid product payload",
  E06: "Unsupported tab",
  E07: "Unable to update product right now. Please try again.",
  E08: "Unable to load sibling tab data right now. Please try again.",
  E09: (sku) => `SKU "${sku}" is already used by another product.`,
};

function processTags(tagsArray){
  if(!tagsArray || tagsArray.length === 0) return [];
  return [...new Set(tagsArray.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];
}

function parseSiblingHandles(metafieldValue){
  if(!metafieldValue || typeof metafieldValue !== "string") return [];
  return metafieldValue.split(",").map((h) => h.trim()).filter((h) => h.length > 0);
}

function formatMetafieldValueForSave(siblingHandles){
  if(!siblingHandles || siblingHandles.length === 0) return "";
  return siblingHandles.join(", ");
}

function computeIsDirty(originalData, currentData){
  const originalStr = JSON.stringify(originalData);
  const currentStr = JSON.stringify(currentData);
  return originalStr !== currentStr;
}

function computeDiff(originalBasicInfo,currentBasicInfo,originalSku,currentSku,originalSiblingProducts,currentSiblingProducts){
  const changes = {coreFieldsChanged: false,skuChanged: false,siblingsChanged: false,};
  if(originalBasicInfo.title !== currentBasicInfo.title ||originalBasicInfo.vendor !== currentBasicInfo.vendor ||originalBasicInfo.productType !== currentBasicInfo.productType 
    ||originalBasicInfo.description !== currentBasicInfo.description ||originalBasicInfo.status !== currentBasicInfo.status){
    changes.coreFieldsChanged = true;
  }
  const origTagsSorted = [...originalBasicInfo.tags].sort();
  const currTagsSorted = [...currentBasicInfo.tags].sort();
  if(JSON.stringify(origTagsSorted) !== JSON.stringify(currTagsSorted)) {
    changes.coreFieldsChanged = true;
  }
  if(originalSku !== currentSku) {
    changes.skuChanged = true;
  }
  const origSibsSorted = [...originalSiblingProducts].sort();
  const currSibsSorted = [...currentSiblingProducts].sort();
  if(JSON.stringify(origSibsSorted) !== JSON.stringify(currSibsSorted)) {
    changes.siblingsChanged = true;
  }
  return changes;
}

export { parseSiblingHandles,  processTags, formatMetafieldValueForSave, computeDiff,computeIsDirty,ERROR_MESSAGES};

function EditPageLayout({ title, isDirty, isSubmitting, onDiscard, onSave, children,showSuccessBanner,successMessage,showErrorBanner,
  errorMessage,showNoChangesBanner,showWarningBanner,warningMessage,actionDataNoOp}){
  return (
    <div className="page">
      <div className="header">
        <h1>{title}</h1>
        <div className="header-actions">
          <button type="button" onClick={onDiscard} className="discard-btn" disabled={!isDirty || isSubmitting}>
            Discard
          </button>
          <button type="submit" form="product-form" className="save-btn" disabled={!isDirty || isSubmitting} onClick={onSave}>
            {isSubmitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {showSuccessBanner && (
        <div className="success-banner" role="status">
          {actionDataNoOp ? "No changes detected - save skipped." : successMessage}
        </div>
      )}

      {showErrorBanner && (
        <div className="error-banner" role="alert">
          {errorMessage}
        </div>
      )}

      {showNoChangesBanner && (
        <div className="info-banner" role="status">
          No changes detected - save skipped.
        </div>
      )}

      {showWarningBanner && (
        <div className="warning-banner" role="status">
          {warningMessage}
        </div>
      )}
      {children}
    </div>
  );
}

EditPageLayout.propTypes = {
  title: PropTypes.string.isRequired,
  isDirty: PropTypes.bool.isRequired,
  isSubmitting: PropTypes.bool.isRequired,
  onDiscard: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  children: PropTypes.node,
  showSuccessBanner: PropTypes.bool,
  successMessage: PropTypes.string,
  showErrorBanner: PropTypes.bool,
  errorMessage: PropTypes.string,
  showNoChangesBanner: PropTypes.bool,
  showWarningBanner: PropTypes.bool,
  warningMessage: PropTypes.string,
  actionDataNoOp: PropTypes.bool,
};

const ACTIONS = {
  SET_BASIC_FIELD: 'SET_BASIC_FIELD',
  SET_TAGS: 'SET_TAGS',
  SET_SIBLING_PRODUCTS: 'SET_SIBLING_PRODUCTS',
  SET_SIBLING_DETAILS: 'SET_SIBLING_DETAILS',
  SET_SIBLINGS_LOADED: 'SET_SIBLINGS_LOADED',
  DISCARD: 'DISCARD',
  SAVE_SUCCESS: 'SAVE_SUCCESS',
  RESET_SIBLINGS: 'RESET_SIBLINGS',
  UPDATE_ORIGINAL_BASIC: 'UPDATE_ORIGINAL_BASIC'
};

function getInitialState(product){
  const initialState = {
    basicInfo: {
      title: product.basicInfo.title,
      sku: product.basicInfo.sku,
      vendor: product.basicInfo.vendor,
      productType: product.basicInfo.productType,
      description: product.basicInfo.description,
      tagsString: product.basicInfo.tags.join(", "),
      status: product.productStatus,
    },
    originalBasicInfo: {
      title: product.basicInfo.title,
      sku: product.basicInfo.sku,
      vendor: product.basicInfo.vendor,
      productType: product.basicInfo.productType,
      description: product.basicInfo.description,
      tags: [...product.basicInfo.tags],
      status: product.productStatus,
    },
    siblingProducts: [],
    siblingDetails: [],
    originalSiblingProducts: [],
    originalSiblingDetails: [],
    siblingsLoaded: false,
    isDirty: false,
  };
  
  initialState.combinedOriginal = {
    basicInfo: initialState.originalBasicInfo,
    siblings: initialState.originalSiblingProducts
  };
  initialState.combinedCurrent = {
    basicInfo: initialState.basicInfo,
    siblings: initialState.siblingProducts
  };
  return initialState;
}

function formReducer(state, action){
  switch(action.type){
    case ACTIONS.SET_BASIC_FIELD: {
      const newBasicInfo = { ...state.basicInfo, [action.field]: action.value };
      const combinedCurrent = {
        basicInfo: newBasicInfo,
        siblings: state.siblingProducts
      };
      const isDirty = computeIsDirty(state.combinedOriginal, combinedCurrent);
      return{...state, basicInfo: newBasicInfo, isDirty,combinedCurrent};
    }
    case ACTIONS.SET_TAGS: {
      const newBasicInfo = { ...state.basicInfo, tagsString: action.value };
      const combinedCurrent = {
        basicInfo: newBasicInfo,
        siblings: state.siblingProducts
      };
      const isDirty = computeIsDirty(state.combinedOriginal, combinedCurrent);
      return {...state, basicInfo: newBasicInfo, isDirty,combinedCurrent};
    }
    case ACTIONS.SET_SIBLING_PRODUCTS: {
      const newState = { 
        ...state, 
        siblingProducts: action.handles,
        siblingDetails: action.details || state.siblingDetails
      };
      if(action.isInitialLoad){
        newState.originalSiblingProducts = [...action.handles];
        newState.originalSiblingDetails = [...(action.details || [])];
        newState.combinedOriginal = {
          basicInfo: state.originalBasicInfo,
          siblings: newState.originalSiblingProducts
        };
      }
      const combinedCurrent = {
        basicInfo: state.basicInfo,
        siblings: newState.siblingProducts
      };
      newState.isDirty = computeIsDirty(newState.combinedOriginal, combinedCurrent);
      newState.combinedCurrent = combinedCurrent;
      return newState;
    }
    case ACTIONS.SET_SIBLING_DETAILS: {
      return { ...state, siblingDetails: action.details };
    }
    case ACTIONS.SET_SIBLINGS_LOADED: {
      return { ...state, siblingsLoaded: action.loaded };
    }
    case ACTIONS.SAVE_SUCCESS: {
      const newOriginalBasicInfo = {
        ...state.originalBasicInfo,
        title: action.payload.title,
        vendor: action.payload.vendor,
        productType: action.payload.productType,
        description: action.payload.description,
        tags: action.payload.tags,
        status: action.payload.status,
        sku: action.payload.sku
      };
      const newOriginalSiblingProducts = [...action.savedSiblings];
      return {
        ...state,
        originalBasicInfo: newOriginalBasicInfo,
        basicInfo: {
          ...state.basicInfo,
          title: action.payload.title,
          vendor: action.payload.vendor,
          productType: action.payload.productType,
          description: action.payload.description,
          tagsString: action.payload.tags.join(", "),
          status: action.payload.status,
        },
        originalSiblingProducts: newOriginalSiblingProducts,
        siblingProducts: [...action.savedSiblings],
        siblingDetails: action.details.map(d => ({ ...d, pending: false })),
        originalSiblingDetails: action.details.map(d => ({ ...d, pending: false })),
        combinedOriginal: {
          basicInfo: newOriginalBasicInfo,
          siblings: newOriginalSiblingProducts
        },
        combinedCurrent: {
          basicInfo: {
            title: action.payload.title,
            vendor: action.payload.vendor,
            productType: action.payload.productType,
            description: action.payload.description,
            tagsString: action.payload.tags.join(", "),
            status: action.payload.status,
          },
          siblings: [...action.savedSiblings]
        },
        isDirty: false,
      };
    }
    
    case ACTIONS.DISCARD: {
      const revertedBasicInfo = {
        title: state.originalBasicInfo.title,
        sku: state.originalBasicInfo.sku,
        vendor: state.originalBasicInfo.vendor,
        productType: state.originalBasicInfo.productType,
        description: state.originalBasicInfo.description,
        tagsString: state.originalBasicInfo.tags.join(", "),
        status: state.originalBasicInfo.status,
      };
      const revertedSiblingProducts = [...state.originalSiblingProducts];
      let revertedSiblingDetails = [];
      state.originalSiblingProducts.forEach(handle => {
        let existingDetail = state.siblingDetails.find(d => d.handle === handle);
        if(!existingDetail && state.originalSiblingDetails){
          existingDetail = state.originalSiblingDetails.find(d => d.handle === handle);
        }
        if(existingDetail){
          revertedSiblingDetails.push({...existingDetail, pending: false,missing: existingDetail.missing || false});
        } else {
          revertedSiblingDetails.push({
            id: null,
            handle: handle,
            title: handle,
            vendor: "",
            productType: "",
            status: "",
            sku: "",
            image: "",
            missing: true
          });
        }
      });
      
      const combinedCurrent = {
        basicInfo: revertedBasicInfo,
        siblings: revertedSiblingProducts
      };
      
      return { ...state,
        basicInfo: revertedBasicInfo,
        siblingProducts: revertedSiblingProducts,
        siblingDetails: revertedSiblingDetails,
        combinedCurrent,
        isDirty: false,
      };
    }
    default:
      return state;
  }
}

function Tabs({ activeTab, onTabChange, isDirty, siblingCount }){
  return (
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={activeTab === "basic"} className={activeTab === "basic" ? "tab active" : "tab"} 
      onClick={() => onTabChange("basic")} type="button">
        Basic Info
        {isDirty && " *"}
      </button>
      <button role="tab" aria-selected={activeTab === "siblings"} className={activeTab === "siblings" ? "tab active" : "tab"}
        onClick={() => onTabChange("siblings")} type="button">
        Siblings
        {siblingCount > 0 ? ` (${siblingCount})` : ""}
        {isDirty && " *"}
      </button>
    </div>
  );
}

Tabs.propTypes = {
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  isDirty: PropTypes.bool.isRequired,
  siblingCount: PropTypes.number.isRequired,
};

export async function loader({ request, params }){
  const handle = params.handle;
  if(!handle){
    throw new Response(ERROR_MESSAGES.E01, { status: 400 });
  }
  let admin;
  try{
    ({ admin } = await authenticate.admin(request));
  }catch{
    throw new Response(ERROR_MESSAGES.E03, { status: 401 });
  }
  const url = new URL(request.url);
  if(url.searchParams.get("siblings") === "1"){
    return loadSiblingsLazy(admin, handle);
  }
  let responseJson;
  try{
    const response = await admin.graphql(PRODUCT_QUERY, {
      variables: { handle: `handle:${handle}` },
    });
    responseJson = await response.json();
    if (responseJson.errors) throw new Error(JSON.stringify(responseJson.errors));
  }catch{
    throw new Response(ERROR_MESSAGES.E07, { status: 500 });
  }
  const product = responseJson?.data?.products?.nodes?.[0];
  if(!product){
    throw new Response(ERROR_MESSAGES.E04, { status: 404 });
  }
  return{
    id: product.id,
    handle: product.handle,
    variantId: product.variants?.nodes?.[0]?.id || "",
    basicInfo: {
      title: product.title || "",
      sku: product.variants?.nodes?.[0]?.sku || "",
      vendor: product.vendor || "",
      productType: product.productType || "",
      description: product.descriptionHtml || "",
      tags: product.tags || [],
    },
    productStatus: product.status || "DRAFT",
  };
}

async function loadSiblingsLazy(admin, handle){
  try{
    const metaResp = await admin.graphql(SIBLINGS_METAFIELD_QUERY, {
      variables: { handle: `handle:${handle}` },
    });
    const metaJson = await metaResp.json();
    if(metaJson.errors){
      console.error("GraphQL errors:", metaJson.errors);
      return { siblingProducts: [], siblingDetails: [], partialFailure: false, loadError: true };
    }
    const productNode = metaJson?.data?.products?.nodes?.[0];
    if(!productNode) {
      return { siblingProducts: [], siblingDetails: [], partialFailure: false, loadError: false };
    }
    const metafield = productNode?.metafield;
    if(!metafield?.value) {
      return { siblingProducts: [], siblingDetails: [], partialFailure: false, loadError: false };
    }
    let siblingHandles = parseSiblingHandles(metafield.value);
    siblingHandles = [...new Set(siblingHandles.filter(Boolean))];
    if(siblingHandles.length === 0){
      return { siblingProducts: [], siblingDetails: [], partialFailure: false, loadError: false };
    }
    const queryString = siblingHandles.map((h) => `handle:${h}`).join(" OR ");
    const siblingsResp = await admin.graphql(SIBLING_PRODUCTS_QUERY, {
      variables: { queryString },
    });
    const siblingsJson = await siblingsResp.json();
    if(siblingsJson.errors){
      console.error("Sibling query errors:", siblingsJson.errors);
      return { siblingProducts: siblingHandles, siblingDetails: [], partialFailure: true, loadError: false };
    }
    const nodes = siblingsJson?.data?.products?.nodes || [];
    const foundMap = new Map();
    nodes.forEach((p) => {
      foundMap.set(p.handle, {
        id: p.id,
        handle: p.handle,
        title: p.title || p.handle,
        vendor: p.vendor || "",
        productType: p.productType || "",
        status: p.status || "DRAFT",
        sku: p.variants?.nodes?.[0]?.sku || "",
        image: p.featuredImage?.url || "",
      });
    });
    const siblingDetails = siblingHandles.map((h) => {
      if(foundMap.has(h)) return foundMap.get(h);
      return { id: null, handle: h, title: h, vendor: "", productType: "", status: "", sku: "", image: "", missing: true };
    });
    const missingCount = siblingDetails.filter((d) => d.missing).length;
    return {
      siblingProducts: siblingHandles,
      siblingDetails,
      partialFailure: missingCount > 0,
      loadError: false,
    };
  }catch(error){
    console.error("loadSiblingsLazy error:", error);
    return { siblingProducts: [], siblingDetails: [], partialFailure: false, loadError: true };
  }
}

export async function action({ request }){
  let admin;
  try{
    ({ admin } = await authenticate.admin(request));
  }catch{
    return { success: false, message: ERROR_MESSAGES.E03 };
  }
  const formData = await request.formData();
  const id = formData.get("id");
  const handle = formData.get("handle");
  const tab = formData.get("_tab");
  if(tab && !["basic", "siblings"].includes(tab)) {
    return { success: false, message: ERROR_MESSAGES.E06 };
  }
  if(!handle) return { success: false, message: ERROR_MESSAGES.E02 };
  if(!id) return { success: false, message: ERROR_MESSAGES.E05 };

  const title = formData.get("title")?.toString().trim() || "";
  if (!title || title.length < 3 || title.length > 200) {
    return { success: false, message: "Title must be between 3 and 200 characters." };
  }
  const vendor = formData.get("vendor")?.toString().trim() || "";
  if (!vendor) {
    return { success: false, message: "Vendor is required." };
  }
  const productType = formData.get("productType")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const status = formData.get("status")?.toString() || "DRAFT";
  const tagsRaw = formData.get("tags")?.toString() || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const processedTags = processTags(tags);
  const currentSku = formData.get("sku")?.toString().trim() || "";
  
  const originalTitle = formData.get("original_title")?.toString().trim() || "";
  const originalVendor = formData.get("original_vendor")?.toString().trim() || "";
  const originalProductType = formData.get("original_productType")?.toString().trim() || "";
  const originalDescription = formData.get("original_description")?.toString().trim() || "";
  const originalStatus = formData.get("original_status")?.toString().trim() || "DRAFT";
  const originalTagsJson = formData.get("original_tags")?.toString().trim() || "";
  const originalSku = formData.get("original_sku")?.toString().trim() || "";

  let originalTags = [];
  try{
    originalTags = originalTagsJson ? processTags(JSON.parse(originalTagsJson)) : [];
  }catch{
    originalTags = [];
  }
  
  const siblingsWereLoaded = formData.get("siblingsWereLoaded") === "true";
  let originalSiblingProducts = [];
  let currentSiblingProducts = [];

  if(siblingsWereLoaded){
    try{
      originalSiblingProducts = JSON.parse(formData.get("original_siblingProducts") || "[]");
      if(!Array.isArray(originalSiblingProducts)) originalSiblingProducts = []; 
    } catch{ originalSiblingProducts = []; }

    try{
      currentSiblingProducts = JSON.parse(formData.get("siblingProducts") || "[]");
      if(!Array.isArray(currentSiblingProducts)) currentSiblingProducts = [];
    }catch{ currentSiblingProducts = []; }
  }
  const currentBasicInfo = { title, vendor, productType, description, status, tags: processedTags };
  const originalBasicInfo = {
    title: originalTitle,
    vendor: originalVendor,
    productType: originalProductType,
    description: originalDescription,
    status: originalStatus,
    tags: originalTags,
  };
  const changes = computeDiff(originalBasicInfo, currentBasicInfo, originalSku, currentSku, originalSiblingProducts, currentSiblingProducts);

  if(!changes.coreFieldsChanged && !changes.skuChanged && !changes.siblingsChanged){
    return { success: true, message: "Product updated successfully", noOp: true };
  }

  if(changes.skuChanged && currentSku){
    try{
      const skuCheckResponse = await admin.graphql(CHECK_SKU_UNIQUENESS_QUERY, {
        variables: { sku: `sku:${currentSku}` },
      });
      const skuCheckJson = await skuCheckResponse.json();
      const existingProducts = skuCheckJson?.data?.products?.nodes || [];
      const duplicate = existingProducts.find((p) => p.id !== id);
      if(duplicate){
        return { success: false, message: ERROR_MESSAGES.E09(currentSku) };
      }
    }catch(error){
      console.error("SKU uniqueness check error:", error);
    }
  }
  
  try{
    if(changes.coreFieldsChanged){
      const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
        variables: {
          input: {id,title,vendor, productType, descriptionHtml: description, tags: processedTags, status: status.toUpperCase(),},
        },
      });
      const responseJson = await response.json();//converted to json since the output from resopnse is a raw HTML data
      if ((responseJson?.data?.productUpdate?.userErrors?.length ?? 0) > 0) {
        console.error("productUpdate errors:", responseJson?.data?.productUpdate?.userErrors);
        return { success: false, message: ERROR_MESSAGES.E07 };
      }
    }

    if(changes.skuChanged){
      const variantId = formData.get("variant_id")?.toString();
      if(variantId){
        const response = await admin.graphql(VARIANTS_BULK_UPDATE_MUTATION, {
          variables: {
            productId: id,
            variants: [{ id: variantId, sku: currentSku || "" }],
          },
        });
        const responseJson = await response.json();
        if((responseJson?.data?.variantsBulkUpdate?.userErrors?.length ?? 0) > 0) {
          console.error("variantsBulkUpdate errors:", responseJson?.data?.variantsBulkUpdate?.userErrors);
          return { success: false, message: ERROR_MESSAGES.E07 };
        }
      }
    }

    if(changes.siblingsChanged && siblingsWereLoaded){
      const metafieldValue = formatMetafieldValueForSave(currentSiblingProducts);
      const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
        variables: {
          metafields: [
            {
              ownerId: id,
              namespace: "codem",
              key: "sibling_products",
              type: "single_line_text_field",
              value: metafieldValue,
            },
          ],
        },
      });
      const responseJson = await response.json();
      if ((responseJson?.data?.metafieldsSet?.userErrors?.length ?? 0) > 0) {
        console.error("MetafieldsSet errors:", responseJson?.data?.metafieldsSet?.userErrors);
        return { success: false, message: ERROR_MESSAGES.E07 };
      }
    }
    
    return { 
      success: true, 
      message: "Product updated successfully",
      savedBasicInfo: {
        title: title,
        vendor: vendor,
        productType: productType,
        description: description,
        tags: processedTags,
        status: status
      },
      savedSiblings: currentSiblingProducts
    };
  }catch(error){
    console.error("Save error:", error);
    return { success: false, message: ERROR_MESSAGES.E07 };
  }
}

export default function ProductEditPage() {
  const product = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [activeTab, setActiveTab] = useState("basic");
  const [state, dispatch] = useReducer(formReducer, product, getInitialState);
  const siblingFetcher = useFetcher();
  const siblingsLoading = siblingFetcher.state === "loading";
  const [siblingsPartialFailure, setSiblingsPartialFailure] = useState(false);
  const [siblingsLoadError, setSiblingsLoadError] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showNoChangesBanner, setShowNoChangesBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const lastActionRef = useRef(null);

  useEffect(() => {
    if(!actionData || actionData === lastActionRef.current) return;
    lastActionRef.current = actionData;
    if(actionData.success === false){
      setShowErrorBanner(true);
      setErrorMessage(actionData.message);
      const timer = setTimeout(() => {
        setShowErrorBanner(false);
        setErrorMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
    if(!actionData.success) return;
    setShowSuccessBanner(true);
    setSuccessMessage(actionData.message || "Product updated successfully");

    if(actionData.savedBasicInfo && actionData.savedSiblings){
      const updatedDetails = state.siblingDetails.filter(d => 
        actionData.savedSiblings.includes(d.handle)
      );
      dispatch({
        type: ACTIONS.SAVE_SUCCESS,
        payload: actionData.savedBasicInfo,
        savedSiblings: actionData.savedSiblings,
        details: updatedDetails
      });
    }
    const timer = setTimeout(() => {
      setShowSuccessBanner(false);
      setSuccessMessage("");
    }, 3000);
    return () => clearTimeout(timer);
  }, [actionData,state.siblingDetails]);

  useEffect(() => {
    if(siblingFetcher.state !== "idle" || !siblingFetcher.data) return;
    const data = siblingFetcher.data;
    if(data.loadError){
      setSiblingsLoadError(true);
      dispatch({ type: ACTIONS.SET_SIBLINGS_LOADED, loaded: true });
      return;
    }
    const handles = data.siblingProducts || [];
    dispatch({
      type: ACTIONS.SET_SIBLING_PRODUCTS,
      handles: handles,
      details: data.siblingDetails || [],
      isInitialLoad: true
    });
    dispatch({type: ACTIONS.SET_SIBLINGS_LOADED, loaded: true });
    if(data.partialFailure){
      setSiblingsPartialFailure(true);
    }else{
      setSiblingsPartialFailure(false);
    }
    setSiblingsLoadError(false);
  },[siblingFetcher.state, siblingFetcher.data]);

  const fetchSiblingsData = useCallback(() => {
    setSiblingsLoadError(false);
    setSiblingsPartialFailure(false);
    siblingFetcher.load("?siblings=1");
  }, [siblingFetcher]);

  useEffect(() => {
    if(activeTab !== "siblings" || state.siblingsLoaded || siblingsLoading) return;
    fetchSiblingsData();
  }, [activeTab, state.siblingsLoaded, siblingsLoading, fetchSiblingsData]);
  const handleBasicFieldChange = (field, value) => {
    dispatch({type: ACTIONS.SET_BASIC_FIELD, field, value});
  };
  const handleTagsChange = (value) => {
    dispatch({type: ACTIONS.SET_TAGS, value});
  };
  const handleRemoveSibling = (handleToRemove) => {
    if(!window.confirm(`Remove "${handleToRemove}" from siblings?`)) return;
    const newHandles = state.siblingProducts.filter((h) => h !== handleToRemove);
    const newDetails = state.siblingDetails.filter((s) => s.handle !== handleToRemove);
    dispatch({
      type: ACTIONS.SET_SIBLING_PRODUCTS,
      handles: newHandles,
      details: newDetails
    });
  };

  const handleAddSibling = () => {
    const trimmed = newHandle.trim().toLowerCase();
    if(!trimmed) return;

    if(trimmed === product.handle) {
      alert("A product cannot be its own sibling.");
      return;
    }
    if(state.siblingProducts.includes(trimmed)) {
      alert("This sibling already exists.");
      return;
    }
    if(state.siblingProducts.length >= 20) {
      alert("Maximum 20 siblings allowed.");
      return;
    }

    const newHandles = [...state.siblingProducts, trimmed];
    const newDetails = [
      ...state.siblingDetails,
      {
        id: null,
        handle: trimmed,
        title: trimmed,
        vendor: "",
        productType: "",
        status: "",
        sku: "",
        image: "",
        pending: true,
      },
    ];
    dispatch({
      type: ACTIONS.SET_SIBLING_PRODUCTS,
      handles: newHandles,
      details: newDetails
    });
    setNewHandle("");
  };

  const handleDiscard = () => {
    if(!state.isDirty) return;
    if(window.confirm("Discard all unsaved changes?")) {
      dispatch({ type: ACTIONS.DISCARD });
      if(state.siblingsLoaded){
        setSiblingsLoadError(false);
        setSiblingsPartialFailure(false);
      }
    }
  };

  const getSiblingEditUrl = (handle) => {
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/');
    const productsIndex = pathParts.findIndex(part => part === 'products');
    if(productsIndex !== -1){
      const basePathParts = pathParts.slice(0, productsIndex + 1);
      url.pathname = [...basePathParts, encodeURIComponent(handle), 'edit'].join('/');
      return url.toString();
    }
    console.error('Could not find products segment in path');
    return '#';
  };
  const handleSave = () => {
    if(!state.isDirty){
      setShowNoChangesBanner(true);
      setTimeout(() => setShowNoChangesBanner(false), 3000);
    }
  };
  return(
    <>
      <EditPageLayout
        title={`Edit Product: ${product.basicInfo.title}`}
        isDirty={state.isDirty}
        isSubmitting={isSubmitting}
        onDiscard={handleDiscard}
        onSave={handleSave}
        showSuccessBanner={showSuccessBanner}
        successMessage={successMessage}
        showErrorBanner={showErrorBanner}
        errorMessage={errorMessage}
        showNoChangesBanner={showNoChangesBanner}
        showWarningBanner={siblingsPartialFailure && !siblingsLoadError && activeTab === "siblings" && !siblingsLoading}
        warningMessage="⚠️ Some sibling products could not be loaded. You can still save changes to sibling relationships."
        actionDataNoOp={actionData?.noOp}
      >
        <Tabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isDirty={state.isDirty}
          siblingCount={state.siblingProducts.length}
        />
        { activeTab === "siblings" && !siblingsLoading && siblingsLoadError &&(
          <div className="error-banner" role="alert">
            {ERROR_MESSAGES.E08}
          </div>
        )}
        <Form method="post" id="product-form" onSubmit={(e) => {
            if(!state.isDirty) {
              e.preventDefault();//stops the form submission
              setShowNoChangesBanner(true);
              setTimeout(() => setShowNoChangesBanner(false), 3000);
            }
          }}
        >
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="handle" value={product.handle} />
          <input type="hidden" name="variant_id" value={product.variantId} />
          <input type="hidden" name="_tab" value={activeTab} />
          <input type="hidden" name="original_title" value={state.originalBasicInfo.title} />
          <input type="hidden" name="original_sku" value={state.originalBasicInfo.sku} />
          <input type="hidden" name="original_vendor" value={state.originalBasicInfo.vendor} />
          <input type="hidden" name="original_productType" value={state.originalBasicInfo.productType} />
          <input type="hidden" name="original_description" value={state.originalBasicInfo.description} />
          <input type="hidden" name="original_tags" value={JSON.stringify(state.originalBasicInfo.tags)} />
          <input type="hidden" name="original_status" value={state.originalBasicInfo.status} />
          <input type="hidden" name="siblingsWereLoaded" value={String(state.siblingsLoaded)} />
          <input type="hidden" name="original_siblingProducts" value={JSON.stringify(state.originalSiblingProducts)} />
          <input type="hidden" name="siblingProducts" value={JSON.stringify(state.siblingProducts)} />
          <input type="hidden" name="title" value={state.basicInfo.title} />
          <input type="hidden" name="sku" value={state.basicInfo.sku} />
          <input type="hidden" name="vendor" value={state.basicInfo.vendor} />
          <input type="hidden" name="productType" value={state.basicInfo.productType} />
          <input type="hidden" name="description" value={state.basicInfo.description} />
          <input type="hidden" name="tags" value={state.basicInfo.tagsString} />
          <input type="hidden" name="status" value={state.basicInfo.status} />

          <div className="card">
            {activeTab === "basic" && (
              <div className="form" role="tabpanel">
                <div className="field">
                  <label htmlFor="title">Title *</label>
                  <input id="title" type="text" value={state.basicInfo.title} onChange={(e) => handleBasicFieldChange("title", e.target.value)} required
                    minLength={3} maxLength={200} />
                  <small>{state.basicInfo.title.length}/200 characters</small>
                </div>

                <div className="field">
                  <label htmlFor="sku">SKU</label>
                  <input id="sku" type="text" value={state.basicInfo.sku} onChange={(e) => handleBasicFieldChange("sku", e.target.value)}
                    placeholder="SKU must be unique across all products if provided"/>
                </div>

                <div className="field">
                  <label htmlFor="vendor">Vendor *</label>
                  <input id="vendor" type="text" value={state.basicInfo.vendor} onChange={(e) => handleBasicFieldChange("vendor", e.target.value)} required/>
                </div>

                <div className="field">
                  <label htmlFor="productType">Product Type</label>
                  <input id="productType" type="text" value={state.basicInfo.productType} onChange={(e) => handleBasicFieldChange("productType", e.target.value)}
                   placeholder="Optional"
                  />
                </div>

                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" rows={6} value={state.basicInfo.description} onChange={(e) => handleBasicFieldChange("description", e.target.value)}
                             placeholder="HTML supported"
                  />
                </div>

                <div className="field">
                  <label htmlFor="tags">Tags </label>
                  <input id="tags" type="text" value={state.basicInfo.tagsString} onChange={(e) => handleTagsChange(e.target.value)} 
                  placeholder="Tags should be separated by comma"/>
                </div>

                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select id="status" value={state.basicInfo.status} onChange={(e) => handleBasicFieldChange("status", e.target.value)} >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === "siblings" && (
              <div role="tabpanel" aria-label="Siblings">
                <h3>Sibling Products</h3>
                {siblingsLoading && (
                  <div className="loading">
                    <div className="spinner" />
                    Loading siblings…
                  </div>
                )}

                {!siblingsLoading && state.siblingsLoaded && !siblingsLoadError && (
                  <>
                    <div className="siblings-list">
                      {state.siblingDetails.length > 0 ? (state.siblingDetails.map((item, index) => (
                          <div
                            key={item.handle || index}
                            className={[ "sibling-row", item.missing ? "missing" : "", item.pending ? "pending" : "",].filter(Boolean).join(" ")} >
                            <div className="sibling-info">
                              <img
                                src={item.image || "https://placehold.co/50x50/cccccc/666666?text=No+Image"}
                                alt={item.title}
                                className="sibling-thumb"
                                onError={(e) => { e.currentTarget.src = "https://placehold.co/50x50/cccccc/666666?text=No+Image";}}
                              />
                              <div className="sibling-details">
                                <div className="sibling-title">
                                  {item.title || item.handle}
                                  {item.missing && <span className="badge badge--warning"> Not Found</span>}
                                  {item.pending && <span className="badge badge--info"> Pending Save</span>}
                                </div>
                                <div className="sibling-handle">Handle: {item.handle}</div>
                                {item.sku !== undefined && <div className="sibling-sku">SKU: {item.sku || "-"}</div>}
                                {item.vendor && <div className="sibling-vendor">Vendor: {item.vendor}</div>}
                                {item.productType && <div className="sibling-type">Type: {item.productType}</div>}
                                {item.status && <div className="sibling-status">Status: {item.status.toLowerCase()}</div>}
                              </div>
                            </div>
                            <div className="sibling-actions">
                              {!item.missing && !item.pending && (
                                <button type="button" onClick={() => window.open(getSiblingEditUrl(item.handle), "_blank")} className="open-btn">Open</button>
                              )}
                              <button type="button" onClick={() => handleRemoveSibling(item.handle)} className="remove-btn">Remove</button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          No sibling products yet. Add your first sibling below.
                        </div>
                      )}
                    </div>

                    <div className="add-sibling-section">
                      <h4>Add New Sibling</h4>
                      <div className="add-sibling-form">
                        <input type="text" value={newHandle} placeholder="Enter product handle (e.g. my-product-handle)" onChange={(e) => setNewHandle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddSibling();
                            }
                          }}
                        />
                        <button type="button" onClick={handleAddSibling} className="add-btn">Add</button>
                      </div>
                    </div>

                    <div className="siblings-summary">
                      <small>
                        Total: {state.siblingProducts.length} | Found:{" "}
                        {state.siblingDetails.filter((s) => !s.missing && !s.pending).length}
                        {state.siblingDetails.some((s) => s.pending) &&
                          ` | Pending: ${state.siblingDetails.filter((s) => s.pending).length}`}
                        {state.siblingDetails.some((s) => s.missing) &&
                          ` | Not found: ${state.siblingDetails.filter((s) => s.missing).length}`}
                      </small>
                    </div>
                  </>
                )}
              
                {!siblingsLoading && siblingsLoadError && (
                  <div className="empty-state">
                    <p>Could not load sibling products.</p>
                    <button type="button" className="add-btn"
                      onClick={() => {
                        dispatch({ type: ACTIONS.SET_SIBLINGS_LOADED, loaded: false });
                        setSiblingsLoadError(false);
                        fetchSiblingsData();
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Form>
      </EditPageLayout>
    </>
  );
}  

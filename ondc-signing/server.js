// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import {
  createKeyPair,
  createAuthorizationHeader,
  verifyMessage,
  createSigningString,
} from "./utils/cryptoUtils.js";
import routes from "./routes/index.js"; // Importing routes
import { authenticateToken } from "./src/api/controller.js"; // Middleware for API token

dotenv.config();

const stagingDetails = {
  subscriber_id: "opencart-test-adaptor.ondc.org",
  ukId: "1bad2579-d2c1-4169-8580-6ce7b3c96732",
  signing_public_key: "cxEdUA4sM4rJWdzc0YKV/H7dscVvj/47aX6kajOEf20=",
  encr_public_key:
    "MCowBQYDK2VuAyEAjwQ/anmu2DPEff2H5v5BBMOorOngTLLAj2jU9SnHFxU=",
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const upload = multer();
app.use(upload.any());

const privateKey = process.env.PRIVATE_KEY;
const publicKey = stagingDetails.signing_public_key;

app.get("/", (req, res) => {
  res.send("ONDC Signing Server is running!");
});

//OPENCART LOGIN
app.post("/login", async (req, res) => {
  try {
    const { username = "Default", key } = req.body;

    if (!key) {
      return res.status(400).json({ error: "API key is required" });
    }

    const formData = new FormData();
    formData.append("username", username);
    formData.append("key", key);

    const response = await axios.post(
      `${process.env.OPENCART_SITE}/index.php?route=api/login`,
      formData
    );

    const success = response.data.success;
    const apiToken = response.data.api_token;
    console.log("first response data", response.data);

    if (!apiToken) {
      return res.status(401).json({ error: "Invalid credentials or API key" });
    }

    // Store the api_token in a cookie
    //   res.cookie("api_token", apiToken, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production",
    //     sameSite: 'strict', // Or 'lax' if needed, but 'strict' is preferred
    //     maxAge: 24 * 60 * 60 * 1000,
    //     // domain: '.example.com'  // Only if using subdomains!
    // });
    // res.cookie('api_token','apiToken', { httpOnly: true, secure: true, maxAge: 3600000 })
    res.cookie("api_token", apiToken, { httpOnly: true, maxAge: 3600000 });
    const authCookie = req.cookies;
    console.log("first cookies", authCookie);

    // Respond with the api_token
    return res.json({ message: success, api_token: apiToken });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while processing the login" });
  }
});

app.post("/cookie", async (req, res) => {
  try {
    const authCookie = req.cookies;
    console.log("first cookies", authCookie);

    // Respond with the api_token
    return res.json({ message: "success", api_token: authCookie });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching the cookiess" });
  }
});

app.get("/getCategoryWiseProducts", async (req, res) => {
  try {
    if (!api_token) {
      return res.status(401).json({ error: "Unauthorized: API token is missing" });
  }

    if (!api_token) {
      return res.status(400).json({ error: "API token is required" });
    }
    const { categoryName } = req.body;

    const formData = new FormData();
    formData.append("category", categoryName);

    const response = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categories&json`,
      
    );

    console.log("first category name", categoryName);
    const categories = response.data;
    // console.log('response.data');
    // console.log(categories);
    console.log("dtype:", typeof categories);
    console.log("\n\n\n");

    if (!Array.isArray(categories)) {
      return res
        .status(500)
        .json({ error: "Invalid response format from API" });
    }

    // Find the category by name
    const foundCategory = categories.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!foundCategory) {
      return res
        .status(404)
        .json({ error: `Category "${categoryName}" not found` });
    }

    const categoryId = foundCategory.category_id;
    console.log(`Category ID for "${categoryName}" is:`, categoryId);

    const products = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categoryList&json&path=${categoryId}`
    );

    console.log("products: \n ", products.data);

    // res.json({ category_id: categoryId, message: "Category ID found" });
    res.json({ products: products, message: "Category ID found" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products" });
  }
});

app.post("/ondc/search", async (req, res) => {
  try {
    const ondcRequest = req.body;
    // const categoryId = categoryMapping[ondcRequest.message.intent.category.id];
    const categoryId = 18;

    if (!categoryId) {
      return res
        .status(400)
        .json({ error: "Invalid or unsupported category ID" });
    }

    const opencartResponse = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categoryList&json&path=${categoryId}`
    );

    const products = opencartResponse.data;

    const ondcResponse = {
      context: {
        ...ondcRequest.context,
        action: "on_search",
        timestamp: new Date().toISOString(),
      },
      message: {
        catalog: {
          "bpp/descriptor": {
            name: "Your Store Name",
            long_desc: "Description of your store",
            images: ["URL to your store image"],
          },
          "bpp/providers": [
            {
              id: "provider-id",
              descriptor: {
                name: "Provider Name",
                long_desc: "Provider Description",
                images: ["URL to provider image"],
              },
              locations: [
                {
                  id: "location-id",
                  gps: "latitude,longitude",
                  address: {
                    door: "Door Number",
                    name: "Building Name",
                    street: "Street Name",
                    locality: "Locality",
                    ward: "Ward",
                    city: "City",
                    state: "State",
                    country: "Country",
                    area_code: "Area Code",
                  },
                },
              ],
              items: Object.values(products).map((product) => ({
                id: product.product_id,
                descriptor: {
                  name: product.name,
                  long_desc: product.description,
                  images: [
                    `${process.env.OPENCART_SITE}/image/${product.image}`,
                  ],
                },
                price: {
                  currency: "INR",
                  value: product.price,
                },
                category_id: categoryId,
                fulfillment_id: "Fulfillment ID",
                location_id: "Location ID",
                available_quantity: product.quantity,
                sku: product.sku,
              })),
            },
          ],
        },
      },
    };

    res.json(ondcResponse);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the request" });
  }
});

//on_search
// app.get("/ondc/on_search", async (req, res) => {
//   try {
//     const payload = req.body;
//     // Fetching the products from the OpenCart API
//     const opencartApiUrl = 'http://localhost/opencart-3/index.php?route=api/allproducts&json';
//     const response = await axios.get(opencartApiUrl);

//     const opencartProducts = response.data.shop_products;

//     // If no products are found
//     if (!opencartProducts || opencartProducts.length === 0) {
//       return res.status(404).json({ error: 'No products found' });
//     }

//     const mappedData = {
//       context: {
//         domain: payload.context.domain,
//         country: payload.context.country,
//         city: payload.context.city,
//         action: payload.context.action,
//         core_version: payload.context.core_version,
//         bap_id: payload.context.bap_id,
//         bap_uri: payload.context.bap_uri,
//         bpp_id: payload.context.bpp_id,
//         bpp_uri: payload.context.bpp_uri,
//         transaction_id: payload.context.transaction_id,
//         message_id: payload.context.message_id,
//         timestamp: payload.context.timestamp,
//         ttl: payload.context.ttl
//       },
//       message: {
//         catalog: {
//           bpp: {
//             fulfillments: payload.message.catalog["bpp/fulfillments"],
//             descriptor: {
//               name: payload.message.catalog["bpp/descriptor"].name,
//               symbol: payload.message.catalog["bpp/descriptor"].symbol,
//               short_desc: payload.message.catalog["bpp/descriptor"].short_desc,
//               long_desc: payload.message.catalog["bpp/descriptor"].long_desc,
//               images: payload.message.catalog["bpp/descriptor"].images,
//               tags: payload.message.catalog["bpp/descriptor"].tags
//             },
//             providers: payload.message.catalog["bpp/providers"].map(provider => ({
//               id: provider.id,
//               time: provider.time,
//               descriptor: {
//                 name: provider.descriptor.name,
//                 symbol: provider.descriptor.symbol,
//                 short_desc: provider.descriptor.short_desc,
//                 long_desc: provider.descriptor.long_desc,
//                 images: provider.descriptor.images
//               },
//               ttl: provider.ttl,
//               locations: provider.locations.map(location => ({
//                 id: location.id,
//                 gps: location.gps,
//                 address: location.address,
//                 circle: location.circle,
//                 time: location.time
//               })),
//               items: provider.items.map(item => ({
//                 id: item.id,
//                 time: item.time,
//                 descriptor: {
//                   name: item.descriptor.name,
//                   code: item.descriptor.code,
//                   symbol: item.descriptor.symbol,
//                   short_desc: item.descriptor.short_desc,
//                   long_desc: item.descriptor.long_desc,
//                   images: item.descriptor.images
//                 },
//                 quantity: item.quantity,
//                 price: item.price,
//                 category_id: item.category_id,
//                 fulfillment_id: item.fulfillment_id,
//                 location_id: item.location_id,
//                 recommended: item.recommended,
//                 "@ondc/org/returnable": item["@ondc/org/returnable"],
//                 "@ondc/org/cancellable": item["@ondc/org/cancellable"],
//                 "@ondc/org/seller_pickup_return": item["@ondc/org/seller_pickup_return"],
//                 "@ondc/org/time_to_ship": item["@ondc/org/time_to_ship"],
//                 "@ondc/org/available_on_cod": item["@ondc/org/available_on_cod"],
//                 "@ondc/org/return_window": item["@ondc/org/return_window"],
//                 "@ondc/org/contact_details_consumer_care": item["@ondc/org/contact_details_consumer_care"],
//                 tags: item.tags
//               }))
//             }))
//           }
//         }
//       }
//     };

//     // Prepare the ONDC catalog response
//     const ondcCatalog = {
//       "bpp/fulfillments": [
//         {
//           "id": "F1",
//           "type": "Delivery"
//         }
//       ],
//       "bpp/descriptor": {
//         "name": "Otipy store",
//         "symbol": "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
//         "short_desc": "Online eCommerce Store",
//         "long_desc": "Online eCommerce Store",
//         "images": [
//           "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png"
//         ],
//         "tags": [
//           {
//             "code": "bpp_terms",
//             "list": [
//               {
//                 "code": "np_type",
//                 "value": "ISN"
//               }
//             ]
//           }
//         ]
//       },
//       "bpp/providers": [
//         {
//           "id": "4410",
//           "time": {
//             "label": "enable",
//             "timestamp": "2024-01-12T11:41:25.969Z"
//           },
//           "descriptor": {
//             "name": "otipy store 4410",
//             "symbol": "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
//             "short_desc": "Otipy store",
//             "long_desc": "Otipy store_",
//             "images": [
//               "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png"
//             ]
//           },
//           "ttl": "PT24H",
//           "locations": [
//             {
//               "id": "L1",
//               "gps": "28.5500962,77.2443268",
//               "address": {
//                 "locality": "DMS R Block GK 1",
//                 "street": "near texi stand, R Block GK 1, new Delhi 110048",
//                 "city": "Delhi",
//                 "area_code": "110048",
//                 "state": "DL"
//               },
//               "circle": {
//                 "gps": "28.5500962,77.2443268",
//                 "radius": {
//                   "unit": "km",
//                   "value": "3"
//                 }
//               },
//               "time": {
//                 "label": "enable",
//                 "timestamp": "2024-01-12T11:41:25.969Z",
//                 "days": "1,2,3,4,5,6,7",
//                 "schedule": {
//                   "holidays": []
//                 },
//                 "range": {
//                   "start": "0000",
//                   "end": "2359"
//                 }
//               }
//             }
//           ],
//           "items": []
//         }
//       ]
//     };

//     // Map OpenCart products to ONDC format
//     opencartProducts.forEach(product => {
//       const item = {
//         "id": product.product_id,
//         "time": {
//           "label": "enable",
//           "timestamp": "2024-01-12T11:41:25.969Z"
//         },
//         "descriptor": {
//           "name": product.name,
//           "code": `5:${product.product_id}`,
//           "symbol": product.image,
//           "short_desc": product.name,
//           "long_desc": product.name,
//           "images": [
//             product.image
//           ]
//         },
//         "quantity": {
//           "unitized": {
//             "measure": {
//               "unit": "unit",
//               "value": "1"
//             }
//           },
//           "available": {
//             "count": product.quantity
//           },
//           "maximum": {
//             "count": "5"
//           }
//         },
//         "price": {
//           "currency": "INR",
//           "value": product.price,
//           "maximum_value": product.price
//         },
//         "category_id": "dummy_category",
//         "fulfillment_id": "F1",
//         "location_id": "L1",
//         "@ondc/org/returnable": false,
//         "@ondc/org/cancellable": true,
//         "@ondc/org/seller_pickup_return": false,
//         "@ondc/org/time_to_ship": "PT12H",
//         "@ondc/org/available_on_cod": false,
//         "@ondc/org/return_window": "P0D",
//         "@ondc/org/contact_details_consumer_care": "Otipy, help@crofarm.com,18004254444",
//         "tags": [
//           {
//             "code": "origin",
//             "list": [
//               {
//                 "code": "country",
//                 "value": "IND"
//               }
//             ]
//           },
//           {
//             "code": "veg_nonveg",
//             "list": [
//               {
//                 "code": "veg",
//                 "value": "yes"
//               }
//             ]
//           }
//         ]
//       };
//       ondcCatalog['bpp/providers'][0]['items'].push(item);
//     });

//     // Send the ONDC catalog as the response
//     res.json(ondcCatalog);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: "An error occurred while fetching products" });
//   }
// });

// app.post("/ondc/on_search", async (req, res) => {
//   try {
//     const payload = req.body;

//     // Fetching the products from the OpenCart API
//     const opencartApiUrl =
//       "http://localhost/opencart-3/index.php?route=api/allproducts&json";
//     const response = await axios.get(opencartApiUrl);
//     const opencartProducts = response.data.shop_products;
    
//     const opencartApiStoreInfo =
//       "http://localhost/opencart-3/index.php?route=api/allproducts/contact";
//     const store = await axios.get(opencartApiStoreInfo);
//     const storeInfo = store.data;

//     console.log("storeInfo\n", storeInfo);

//     const opencartApiCategories =
//       "http://localhost/opencart-3/index.php?route=api/allproducts/categories&json";
//     const categories = await axios.get(opencartApiCategories);
//     const categoriesInfo = categories.data;

//     console.log("\n\n\ncategoriesInfo\n", categoriesInfo);

//     // If no products are found
//     if (!opencartProducts || opencartProducts.length === 0) {
//       return res.status(404).json({ error: "No products found" });
//     }
//     // If no categories are found
//     if (!categoriesInfo || categoriesInfo.length === 0) {
//       return res.status(404).json({ error: "No categories found" });
//     }
//     // If no products are found
//     if (!storeInfo || storeInfo.length === 0) {
//       return res.status(404).json({ error: "No store info found" });
//     }

//     // Prepare the ONDC catalog with static data
//     const ondcCatalog = {
//       context: {
//         domain: payload.context.domain,
//         country: payload.context.country,
//         city: payload.context.city,
//         action: payload.context.action,
//         core_version: payload.context.core_version,
//         bap_id: payload.context.bap_id,
//         bap_uri: payload.context.bap_uri,
//         bpp_id: payload.context.bpp_id,
//         bpp_uri: payload.context.bpp_uri,
//         transaction_id: payload.context.transaction_id,
//         message_id: payload.context.message_id,
//         timestamp: payload.context.timestamp,
//         ttl: payload.context.ttl,
//       },
//       message: {
//         ["bpp/fulfillments"]: [
//           {
//             id: "F1",
//             type: "Delivery",
//           },
//         ],
//         ["bpp/descriptor"]: {
//           name: "Opencart Store",
//           symbol: storeInfo.image,
//           short_desc: "Online eCommerce Store",
//           long_desc: "Online eCommerce Store",
//           images: [
//             "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
//           ],
//           tags: [
//             {
//               code: "bpp_terms",
//               list: [
//                 {
//                   code: "np_type",
//                   value: "ISN",
//                 },
//               ],
//             },
//           ],
//         },
//         ["bpp/providers"]: [
//           {
//             id: "4410",
//             time: {
//               label: "enable",
//               timestamp: new Date().toISOString(),
//             },
//             "fulfillments":
//           [
//             {
//               "id":"F1",
//               "type":"Delivery",
//               "contact":
//               {
//                 "phone": storeInfo.telephone,
//                 "email":"abc@xyz.com"
//               }
//             }
//           ],
//             descriptor: {
//               name: storeInfo.store,
//               symbol: storeInfo.image,
//               short_desc: storeInfo.comment || "Opencart store",
//               long_desc: "Opencart store_",
//               images: [
//                 "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
//               ],
//             },
//             ttl: "PT24H",
//             locations: [
//               {
//                 id: "L1",
//                 gps: "28.5500962,77.2443268",
//                 address: {
//                   locality: storeInfo.address,
//                   street: storeInfo.address,
//                   city: "Delhi",
//                   area_code: storeInfo.geocode,
//                   state: "DL",
//                 },
//                 circle: {
//                   gps: "28.5500962,77.2443268",
//                   radius: {
//                     unit: "km",
//                     value: "3",
//                   },
//                 },
//                 time: {
//                   label: "enable",
//                   timestamp: new Date().toISOString(),
//                   days: "1,2,3,4,5,6,7",
//                   schedule: {
//                     holidays: [],
//                   },
//                   range: {
//                     start: "0000",
//                     end: "2359",
//                   },
//                 },
//               },
//             ],
//           categories: [],
//             items: [],
//           },
//         ],
//       },
//     };

//     if (!Array.isArray(ondcCatalog["bpp/providers"])) {
//       ondcCatalog["bpp/providers"] = [];
//     }
    
//     if (!ondcCatalog["bpp/providers"][0]) {
//       ondcCatalog["bpp/providers"][0] = { items: [] };
//     }

//     //Map opencart categories to ONDC format
//     categoriesInfo.forEach((category) => {
//       const item = {
//         "id": category.id,
//         "descriptor":
//         {
//           "name": category.name
//         },
//         "tags":
//         [
//           {
//             "code":"type",
//             "list":
//             [
//               {
//                 "code":"type",
//                 "value":"variant_group"
//               }
//             ]
//           },
//           {
//             "code":"attr",
//             "list":
//             [
//               {
//                 "code":"name",
//                 "value":"item.quantity.unitized.measure"
//               },
//               {
//                 "code":"seq",
//                 "value":"1"
//               }
//             ]
//           }
//         ]
//       }
//     });
    
//     // Map OpenCart products to ONDC format
//     opencartProducts.forEach((product) => {
//       const item = {
//         id: product.product_id,
//         time: {
//           label: "enable",
//           timestamp: "2024-01-12T11:41:25.969Z",
//         },
//         descriptor: {
//           name: product.name,
//           code: `5:${product.product_id}`,
//           symbol: product.image,
//           short_desc: product.name,
//           long_desc: product.name,
//           images: [product.image],
//         },
//         quantity: {
//           unitized: {
//             measure: {
//               unit: "unit",
//               value: "1",
//             },
//           },
//           available: {
//             count: product.quantity,
//           },
//           maximum: {
//             count: "5",
//           },
//         },
//         price: {
//           currency: "INR",
//           value: product.price,
//           maximum_value: product.price,
//         },
//         category_id: "dummy_category",
//         fulfillment_id: "F1",
//         location_id: "L1",
//         "@ondc/org/returnable": false,
//         "@ondc/org/cancellable": true,
//         "@ondc/org/seller_pickup_return": false,
//         "@ondc/org/time_to_ship": "PT12H",
//         "@ondc/org/available_on_cod": false,
//         "@ondc/org/return_window": "P0D",
//         "@ondc/org/contact_details_consumer_care":
//           "Otipy, help@crofarm.com,18004254444",
//         tags: [
//           {
//             code: "origin",
//             list: [
//               {
//                 code: "country",
//                 value: "IND",
//               },
//             ],
//           },
//           {
//             code: "veg_nonveg",
//             list: [
//               {
//                 code: "veg",
//                 value: "yes",
//               },
//             ],
//           },
//         ],
//       };
//       ondcCatalog["bpp/providers"][0]["items"].push(item);
//     });
    

//     // Send the ONDC catalog as the response
//     res.json(ondcCatalog);
//   } catch (error) {
//     console.error(error);
//     return res
//       .status(500)
//       .json({ error: "An error occurred while fetching products" });
//   }
// });

app.post("/ondc/on_search", async (req, res) => {
  try {
    const payload = req.body;

    const opencartApiUrl = "http://localhost/opencart-3/index.php?route=api/allproducts&json";
    const response = await axios.get(opencartApiUrl);
    const opencartProducts = response.data.shop_products;

    const opencartApiStoreInfo = "http://localhost/opencart-3/index.php?route=api/allproducts/contact";
    const store = await axios.get(opencartApiStoreInfo);
    const storeInfo = store.data;

    const opencartApiCategories = "http://localhost/opencart-3/index.php?route=api/allproducts/categories&json";
    const categories = await axios.get(opencartApiCategories);
    const categoriesInfo = categories.data;


    if (!opencartProducts || opencartProducts.length === 0) {
      return res.status(404).json({ error: "No products found" });
    }
    if (!categoriesInfo || categoriesInfo.length === 0) {
      return res.status(404).json({ error: "No categories found" });
    }
    if (!storeInfo || storeInfo.length === 0) {
      return res.status(404).json({ error: "No store info found" });
    }

    const ondcCatalog = {
      context: {
        domain: payload.context.domain,
        country: payload.context.country,
        city: payload.context.city,
        action: payload.context.action,
        core_version: payload.context.core_version,
        bap_id: payload.context.bap_id,
        bap_uri: payload.context.bap_uri,
        bpp_id: payload.context.bpp_id,
        bpp_uri: payload.context.bpp_uri,
        transaction_id: payload.context.transaction_id,
        message_id: payload.context.message_id,
        timestamp: payload.context.timestamp,
        ttl: payload.context.ttl,
      },
      message: {
        "bpp/fulfillments": [
          {
            id: "F1",
            type: "Delivery",
          },
        ],
        "bpp/descriptor": {
          name: "Opencart Store",
          symbol: storeInfo.image,
          short_desc: "Online eCommerce Store",
          long_desc: "Online eCommerce Store",
          images: [
            "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
          ],
          tags: [
            {
              code: "bpp_terms",
              list: [
                {
                  code: "np_type",
                  value: "ISN",
                },
              ],
            },
          ],
        },
        "bpp/providers": [
          {
            id: "4410",
            time: {
              label: "enable",
              timestamp: new Date().toISOString(),
            },
            fulfillments: [
              {
                id: "F1",
                type: "Delivery",
                contact: {
                  phone: storeInfo.telephone,
                  email: "abc@xyz.com",
                },
              },
            ],
            descriptor: {
              name: storeInfo.store,
              symbol: storeInfo.image,
              short_desc: storeInfo.comment || "Opencart store",
              long_desc: "Opencart store_",
              images: [
                "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
              ],
            },
            ttl: "PT24H",
            locations: [
              {
                id: "L1",
                gps: "28.5500962,77.2443268",
                address: {
                  locality: storeInfo.address,
                  street: storeInfo.address,
                  city: "Delhi",
                  area_code: storeInfo.geocode,
                  state: "DL",
                },
                circle: {
                  gps: "28.5500962,77.2443268",
                  radius: {
                    unit: "km",
                    value: "3",
                  },
                },
                time: {
                  label: "enable",
                  timestamp: new Date().toISOString(),
                  days: "1,2,3,4,5,6,7",
                  schedule: {
                    holidays: [],
                  },
                  range: {
                    start: "0000",
                    end: "2359",
                  },
                },
              },
            ],
            categories: [], // Initialize categories array here
            items: [],      // Initialize items array here
          },
        ],
      },
    };

    // Map opencart categories and items *directly* into the provider

    categoriesInfo.forEach((category) => {
        ondcCatalog.message["bpp/providers"][0].categories.push({
            id: category.category_id,
            descriptor: {
                name: category.name
            },
            tags: [
                {
                    code: "type",
                    list: [
                        {
                            code: "type",
                            value: "variant_group"
                        }
                    ]
                },
                {
                    code: "attr",
                    list: [
                        {
                            code: "name",
                            value: "item.quantity.unitized.measure"
                        },
                        {
                            code: "seq",
                            value: "1"
                        }
                    ]
                }
            ]
        });
    });

    opencartProducts.forEach((product) => {
      const item = {
        id: product.product_id,
        time: {
          label: "enable",
          timestamp: "2024-01-12T11:41:25.969Z",
        },
        descriptor: {
          name: product.name,
          code: `5:${product.product_id}`,
          symbol: product.image,
          short_desc: product.name,
          long_desc: product.name,
          images: [product.image],
        },
        quantity: {
          unitized: {
            measure: {
              unit: "unit",
              value: "1",
            },
          },
          available: {
            count: product.quantity,
          },
          maximum: {
            count: "5",
          },
        },
        price: {
          currency: "INR",
          value: product.price,
          maximum_value: product.price,
        },
        category_id: "dummy_category", // You might want to map the actual category ID
        fulfillment_id: "F1",
        location_id: "L1",
        "@ondc/org/returnable": false,
        "@ondc/org/cancellable": true,
        "@ondc/org/seller_pickup_return": false,
        "@ondc/org/time_to_ship": "PT12H",
        "@ondc/org/available_on_cod": false,
        "@ondc/org/return_window": "P0D",
        "@ondc/org/contact_details_consumer_care": "Otipy, help@crofarm.com,18004254444",
        tags: [
          {
            code: "origin",
            list: [
              {
                code: "country",
                value: "IND",
              },
            ],
          },
          {
            code: "veg_nonveg",
            list: [
              {
                code: "veg",
                value: "yes",
              },
            ],
          },
        ],
      };
      ondcCatalog.message["bpp/providers"][0].items.push(item);
    });

    res.json(ondcCatalog);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "An error occurred" });
  }
});

//select
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const port = 3000;


app.use(express.json());

const OPENCART_CART_URL = process.env.OPENCART_CART_URL || "http://localhost/opencartsite/index.php?route=api/cart"; 
const OPENCART_API_TOKEN = process.env.OPENCART_API_TOKEN;
const OPENCART_MERCHANT_ID = process.env.OPENCART_MERCHANT_ID;

if (!OPENCART_API_TOKEN || !OPENCART_MERCHANT_ID) {
    console.error("OpenCart API Token or Merchant ID not found in environment variables.");
}

app.post("/ondc/select", async (req, res) => {
    try {
        const payload = req.body;

        if (!payload.context || !payload.message || !payload.message.order) {
            return res.status(400).json({ error: "Invalid request payload" });
        }

        const transactionId = uuidv4();
        const messageId = Date.now().toString();

        const bapId = payload.context.bap_id || "default-buyer.com";
        const bapUri = payload.context.bap_uri || "https://default-buyer.com/ondc";
        const bppId = payload.context.bpp_id || "default-seller.com";
        const bppUri = payload.context.bpp_uri || "https://default-seller.com/ondc";

        const city = payload.context.city || "std:080";
        const country = payload.context.country || "IND";
        const ttl = payload.context.ttl || "PT30S";

        const gps = payload.message.order.fulfillments?.[0]?.end?.location?.gps || "12.4535445,77.9283792";
        const area_code = payload.message.order.fulfillments?.[0]?.end?.location?.address?.area_code || "560001";

        const providerId = payload.message.order.provider.id;
        const locationId = payload.message.order.provider.locations[0].id;

        const items = payload.message.order.items.map((item) => {
            return {
                id: item.id, 
                location_id: locationId,
                quantity: item.quantity || 1,
            };
        });

        console.log("Adding items to OpenCart cart...");
        let opencartSession = null;
        try {
            const cartInitResponse = await axios.get(OPENCART_CART_URL, {
                headers: {
                    "X-Oc-Merchant-Id": OPENCART_MERCHANT_ID,
                    "X-Oc-RestApi-Token": OPENCART_API_TOKEN,
                },
            });

            opencartSession = cartInitResponse.headers["x-oc-session"];

            const cartPromises = items.map(async (item) => {
                return axios.post(
                    OPENCART_CART_URL,
                    {
                        product_id: item.id,
                        quantity: item.quantity,
                    },
                    {
                        headers: {
                            "X-Oc-Merchant-Id": OPENCART_MERCHANT_ID,
                            "X-Oc-Session": opencartSession,
                            "X-Oc-RestApi-Token": OPENCART_API_TOKEN,
                        },
                    }
                );
            });

            await Promise.all(cartPromises);
        } catch (opencartError) {
            console.error("OpenCart API Error:", opencartError.response ? opencartError.response.data : opencartError.message);
            return res.status(502).json({ error: "Error interacting with OpenCart API" });
        }

        console.log("Fetching updated cart...");
        let cartResponse;
        try {
            cartResponse = await axios.get(OPENCART_CART_URL, {
                headers: {
                    "X-Oc-Merchant-Id": OPENCART_MERCHANT_ID,
                    "X-Oc-Session": opencartSession,
                    "X-Oc-RestApi-Token": OPENCART_API_TOKEN,
                },
            });
        } catch (opencartError) {
            console.error("OpenCart API Error:", opencartError.response ? opencartError.response.data : opencartError.message);
            return res.status(502).json({ error: "Error fetching cart from OpenCart API" });
        }

        const response = {
            context: {
                domain: "ONDC:RET10",
                action: "select",
                core_version: "1.2.0",
                bap_id: bapId,
                bap_uri: bapUri,
                bpp_id: bppId,
                bpp_uri: bppUri,
                transaction_id: transactionId,
                message_id: messageId,
                city: city,
                country: country,
                timestamp: new Date().toISOString(),
                ttl: ttl,
            },
            message: {
                order: {
                    provider: {
                        id: providerId,
                        locations: [{ id: locationId }],
                    },
                    items: items,
                    fulfillments: [
                        {
                            end: {
                                location: {
                                    gps: gps,
                                    address: { area_code: area_code },
                                },
                            },
                        },
                    ],
                    payment: {
                        type: "ON-FULFILLMENT",
                    },
                    tags: payload.message.order.tags,
                },
            },
            cart: cartResponse.data, 
        };

        try {
            await axios.post(bppUri + "/on_select", response);
        } catch (bppError) {
            console.error("Error sending on_select to BPP:", bppError);
            return res.status(502).json({ error: "Error forwarding to BPP" });
        }

        res.json(response);
    } catch (error) {
        console.error("Error in /select API:", error);
        res.status(500).json({ error: "Error processing /select: " + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

//confirm
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid'); 
const axios = require('axios'); 

app.use(bodyParser.json());

const orders = {};

app.post('/confirm', async (req, res) => {
    const confirmRequest = req.body;
    console.log('Received /confirm request:', confirmRequest);

    if (!validateConfirmRequest(confirmRequest)) {
        console.error('Validation failed for /confirm request');
        return res.status(400).json({
            context: confirmRequest.context,
            error: {
                type: 'DOMAIN-ERROR',
                code: '31002',
                message: 'Invalid /confirm request',
            },
        });
    }

    const ackResponse = {
        context: confirmRequest.context, 
        message: { ack: { status: 'ACK' } },
    };
    res.json(ackResponse);
    console.log('Sent ACK for /confirm request');

    try {
        const orderId = confirmRequest.message.order.id;
        orders[orderId] = confirmRequest.message.order;
        console.log(`Order ${orderId} created internally`);

        const onConfirmResponse = {
            context: confirmRequest.context,
            message: { order: orders[orderId] },
        };

        sendOnConfirm(confirmRequest.context.bap_uri, onConfirmResponse);
    } catch (error) {
        console.error('Internal error during order creation:', error);
        const nackResponse = {
            context: confirmRequest.context,
            error: {
                type: 'CORE-ERROR',
                code: '31001',
                message: 'Internal server error',
            },
        };
        sendNack(confirmRequest.context.bap_uri, nackResponse);
    }
});

function validateConfirmRequest(confirmRequest) {
    if (!confirmRequest || !confirmRequest.context || !confirmRequest.message || !confirmRequest.message.order) {
        return false;
    }

    const order = confirmRequest.message.order;

    if (!order.id || !Array.isArray(order.items) || order.items.length === 0) {
        return false;
    }

    if (!confirmRequest.context.bap_uri) {
        return false;
    }

    return true;
}

async function sendOnConfirm(bapUri, onConfirmResponse, retries = 3) {
    while (retries > 0) {
        try {
            const response = await axios.post(`${bapUri}/on_confirm`, onConfirmResponse, {
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.status === 200) {
                console.log('/on_confirm sent successfully');
                return;
            }
        } catch (error) {
            console.error(`Attempt failed: ${retries} retries left. Error:`, error);
        }
        retries--;
    }
    console.error('/on_confirm failed after multiple attempts');
}

async function sendNack(bapUri, nackResponse) {
    try {
        await axios.post(`${bapUri}/on_nack`, nackResponse, {
            headers: { 'Content-Type': 'application/json' },
        });
        console.log('/on_nack sent successfully');
    } catch (error) {
        console.error('Error sending /on_nack:', error);
    }
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

//on_confirm
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');


app.use(bodyParser.json());

app.post('/on_confirm', (req, res) => {
    const onConfirmResponse = req.body;
    console.log('Received /on_confirm:', onConfirmResponse);

    if (validateOnConfirm(onConfirmResponse)) {
        res.json({ context: onConfirmResponse.context, message: { ack: { status: 'ACK' } } });
        console.log('Sent ACK for /on_confirm');
        processConfirmedOrder(onConfirmResponse.message.order);
    } else {
        res.status(400).json({
            context: onConfirmResponse.context,
            error: { type: 'DOMAIN-ERROR', code: '23002', message: 'Invalid /on_confirm' },
        });
        console.error('Sent NACK for /on_confirm');
    }
});

function validateOnConfirm(onConfirmResponse) {
    if (!onConfirmResponse || !onConfirmResponse.context || !onConfirmResponse.message || !onConfirmResponse.message.order) {
        return false;
    }

    const order = onConfirmResponse.message.order;

    if (!order.id || !Array.isArray(order.items) || order.items.length === 0) {
        return false;
    }

    if (!orders[order.id]) {
        console.error(`Order ID ${order.id} not found in stored orders`);
        return false;
    }

    return true;
}

function processConfirmedOrder(order) {
    console.log(`Processing confirmed order: ${order.id}`);

    orders[order.id].status = 'CONFIRMED';

    console.log(`Notifying buyer about order confirmation for Order ID: ${order.id}`);

    console.log(`Order ID: ${order.id} is being sent for fulfillment`);
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


//update
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

app.use(bodyParser.json());

//const orders = {};

app.post('/update', async (req, res) => {
    const updateRequest = req.body;
    console.log('Received /update request:', updateRequest);

    if (!validateUpdateRequest(updateRequest)) {
        console.error('Validation failed for /update request');
        return res.status(400).json({
            context: updateRequest.context,
            error: {
                type: 'DOMAIN-ERROR',
                code: '31002',
                message: 'Invalid /update request',
            },
        });
    }

    try {
        const orderId = updateRequest.message.order.id;
        if (!orders[orderId]) {
            return res.status(404).json({
                context: updateRequest.context,
                error: {
                    type: 'DOMAIN-ERROR',
                    code: '40001',
                    message: 'Order not found',
                },
            });
        }

        const updatedOrder = processOrderUpdate(orders[orderId], updateRequest.message);

        res.json({
            context: updateRequest.context,
            message: { ack: { status: 'ACK' } },
        });

        setTimeout(() => {
            sendOnUpdate(updateRequest.context.bpp_uri, {
                context: updateRequest.context,
                message: { order: updatedOrder },
            });
        }, 0);

    } catch (error) {
        console.error('Error processing /update request:', error);
        return res.status(500).json({
            context: updateRequest.context,
            error: {
                type: 'CORE-ERROR',
                code: '31001',
                message: 'Internal server error',
            },
        });
    }
});


function validateUpdateRequest(updateRequest) {
    if (!updateRequest || !updateRequest.context || !updateRequest.message) {
        return false;
    }

    const { message } = updateRequest;
    if (!message.order?.id || !message.update_target) {
        return false;
    }

    switch (message.update_target) {
        case 'fulfillment':
            if (!message.fulfillment || !message.fulfillment.id || !message.fulfillment.state) {
                console.error('Invalid fulfillment update');
                return false;
            }
            break;

        case 'item':
            if (!message.item || !message.item.id || !message.return || !message.return.state) {
                console.error('Invalid item update');
                return false;
            }
            break;

        case 'payment':
            if (!message.payment || typeof message.payment !== 'object') {
                console.error('Invalid payment update');
                return false;
            }
            break;

        default:
            console.error(`Unsupported update_target: ${message.update_target}`);
            return false;
    }

    return true;
}

function processOrderUpdate(order, updateMessage) {
    const updateTarget = updateMessage.update_target;

    if (updateTarget === 'fulfillment' && order.fulfillments) {
        order.fulfillments.forEach(fulfillment => {
            if (fulfillment.id === updateMessage.fulfillment?.id) {
                fulfillment.state = updateMessage.fulfillment.state;
            }
        });
    } else if (updateTarget === 'item' && order.items) {
        order.items.forEach(item => {
            if (item.id === updateMessage.item?.id) {
                item.return = updateMessage.return;
            }
        });
    } else if (updateTarget === 'payment' && updateMessage.payment) {
        order.payment = updateMessage.payment;
    }

    return order;
}

async function sendOnUpdate(bppUri, onUpdateResponse, attempt = 1) {
    const maxRetries = 3; 
    const delay = Math.pow(2, attempt) * 100; 

    try {
        const response = await axios.post(`${bppUri}/on_update`, onUpdateResponse, {
            headers: { 'Content-Type': 'application/json' },
        });

        console.log(`/on_update sent successfully on attempt ${attempt}`);
        return response.data;

    } catch (error) {
        console.error(`/on_update failed on attempt ${attempt}. Error: ${error.message}`);

        if (attempt < maxRetries) {
            console.log(`Retrying /on_update in ${delay}ms...`);
            setTimeout(() => sendOnUpdate(bppUri, onUpdateResponse, attempt + 1), delay);
        } else {
            console.error(`/on_update failed after ${maxRetries} attempts.`);
        }
    }
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

//on_update
const express = require('express');
const bodyParser = require('body-parser');


app.use(bodyParser.json());

//const orders = {};

app.post('/on_update', (req, res) => {
    const onUpdateResponse = req.body;
    console.log('Received /on_update:', onUpdateResponse);

    if (validateOnUpdate(onUpdateResponse)) {
        res.json({ context: onUpdateResponse.context, message: { ack: { status: 'ACK' } } });
        console.log('Sent ACK for /on_update');
        processOnUpdate(onUpdateResponse.message.order);
    } else {
        res.status(400).json({
            context: onUpdateResponse.context,
            error: { type: 'DOMAIN-ERROR', code: '23002', message: 'Invalid /on_update' },
        });
        console.error('Sent NACK for /on_update');
    }
});

function validateOnUpdate(onUpdateResponse) {
    if (!onUpdateResponse || !onUpdateResponse.context || !onUpdateResponse.message || !onUpdateResponse.message.order) {
        return false;
    }

    const order = onUpdateResponse.message.order;

    if (!order.id || !Array.isArray(order.items)) {
        return false;
    }

    if (!orders[order.id]) {
        console.error(`Order ID ${order.id} not found in stored orders`);
        return false;
    }

    return true;
}

function processOnUpdate(order) {
    console.log(`Processing /on_update for order: ${order.id}`);

    orders[order.id] = order;

    if (order.state === 'Cancelled') {
        console.log(`Order ${order.id} has been cancelled.`);
    } else if (order.fulfillments) {
        order.fulfillments.forEach((fulfillment) => {
            if (fulfillment.state === 'Cancelled') {
                console.log(`Fulfillment ${fulfillment.id} for order ${order.id} has been cancelled.`);
            } else if (fulfillment.state === 'Return_Picked') {
              console.log(`Return picked for fulfillment ${fulfillment.id}.`);
            } else if (fulfillment.state === "Return_Delivered") {
              console.log(`Return Delivered for fulfillment ${fulfillment.id}`);
            }
        });
    } else if (order.items) {
        order.items.forEach((item) => {
            if (item.return && item.return.state) {
                console.log(`Return state for item ${item.id} is ${item.return.state}.`);
            }
        });
    }

    console.log(`Order ${order.id} updated successfully in local storage.`);
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

//cancel
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const redis = require('redis');
const winston = require('winston');

//const app = express();
//const port = 3001;

app.use(bodyParser.json());

const client = redis.createClient();

client.on('error', (err) => {
    console.error('Redis error:', err);
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.Console()],
});

async function saveOrder(order) {
    await client.set(order.id, JSON.stringify(order));
}

async function getOrder(orderId) {
    const order = await client.get(orderId);
    return order ? JSON.parse(order) : null;
}

app.post('/on_update', async (req, res) => {
    const onUpdateResponse = req.body;
    logger.info('Received /on_update:', onUpdateResponse);

    if (await validateOnUpdate(onUpdateResponse)) {
        res.json({ context: onUpdateResponse.context, message: { ack: { status: 'ACK' } } });
        logger.info('Sent ACK for /on_update');
        await processOnUpdate(onUpdateResponse.message.order);
    } else {
        res.status(400).json({
            context: onUpdateResponse.context,
            error: { type: 'DOMAIN-ERROR', code: '23002', message: 'Invalid /on_update' },
        });
        logger.error('Sent NACK for /on_update');
    }
});

async function validateOnUpdate(onUpdateResponse) {
    if (!onUpdateResponse || !onUpdateResponse.context || !onUpdateResponse.message || !onUpdateResponse.message.order) {
        return false;
    }

    const order = onUpdateResponse.message.order;
    if (!order.id || !Array.isArray(order.items)) {
        return false;
    }

    const existingOrder = await getOrder(order.id);
    if (!existingOrder) {
        logger.error(`Order ID ${order.id} not found in stored orders`);
        return false;
    }

    return true;
}

async function processOnUpdate(order) {
    logger.info(`Processing /on_update for order: ${order.id}`);

    await saveOrder(order);

    if (order.state === 'Cancelled') {
        logger.info(`Order ${order.id} has been cancelled.`);
    } else if (order.fulfillments) {
        order.fulfillments.forEach((fulfillment) => {
            if (fulfillment.state === 'Cancelled') {
                logger.info(`Fulfillment ${fulfillment.id} for order ${order.id} has been cancelled.`);
            } else if (fulfillment.state === 'Return_Picked') {
                logger.info(`Return picked for fulfillment ${fulfillment.id}.`);
            } else if (fulfillment.state === "Return_Delivered") {
                logger.info(`Return Delivered for fulfillment ${fulfillment.id}`);
            }
        });
    }

    logger.info(`Order ${order.id} updated successfully in local storage.`);
}

app.post('/cancel', async (req, res) => {
    const cancelRequest = req.body;
    logger.info('Received /cancel request:', cancelRequest);

    if (await validateCancelRequest(cancelRequest)) {
        await processCancelRequest(cancelRequest);
        res.json({ context: cancelRequest.context, message: { ack: { status: 'ACK' } } });
        logger.info('Sent ACK for /cancel');

        await sendOnUpdateToBPP(cancelRequest);
    } else {
        res.status(400).json({
            context: cancelRequest.context,
            error: { type: 'DOMAIN-ERROR', code: '30012', message: 'Invalid /cancel request' },
        });
        logger.error('Sent NACK for /cancel');
    }
});

async function validateCancelRequest(cancelRequest) {
    if (!cancelRequest || !cancelRequest.context || !cancelRequest.message) {
        return false;
    }

    const { message } = cancelRequest;
    if (!message.order_id || !message.cancellation_reason_id) {
        return false;
    }

    const order = await getOrder(message.order_id);
    if (!order) {
        logger.error(`Order ${message.order_id} not found.`);
        return false;
    }

    if (order.state === 'Cancelled' || order.state === 'Completed') {
        logger.error(`Order ${message.order_id} is already ${order.state}. Cannot cancel.`);
        return false;
    }

    return true;
}

async function processCancelRequest(cancelRequest) {
    const { message } = cancelRequest;
    const orderId = message.order_id;

    const order = await getOrder(orderId);
    if (order) {
        order.state = 'Cancelled';

        if (message.descriptor && message.descriptor.short_desc) {
            const fulfillmentId = message.descriptor.short_desc;
            if (order.fulfillments) {
                order.fulfillments.forEach(fulfillment => {
                    if (fulfillment.id === fulfillmentId) {
                        fulfillment.state = 'Cancelled';
                    }
                });
            }
        }

        await saveOrder(order);
        logger.info(`Order ${orderId} cancelled. Reason: ${message.cancellation_reason_id}`);
    } else {
        logger.error(`Order ${orderId} not found for cancellation.`);
    }
}

async function sendOnUpdateToBPP(cancelRequest, retryCount = 0) {
    const { context, message } = cancelRequest;
    const orderId = message.order_id;

    const order = await getOrder(orderId);
    if (!order) {
        logger.error(`Order ${orderId} not found in storage.`);
        return;
    }

    const onUpdateMessage = {
        context: { ...context, action: 'on_update' },
        message: { order },
    };

    try {
        await axios.post(`${context.bpp_uri}/on_update`, onUpdateMessage);
        logger.info(`/on_update sent to BPP for cancellation of order ${orderId}`);
    } catch (error) {
        logger.error(`Error sending /on_update to BPP: ${error.message}`);

        if (retryCount < 5) {
            const delay = Math.pow(2, retryCount) * 1000;
            logger.info(`Retrying /on_update in ${delay / 1000} seconds...`);
            setTimeout(() => sendOnUpdateToBPP(cancelRequest, retryCount + 1), delay);
        } else {
            logger.error(`Failed to send /on_update after 5 attempts.`);
        }
    }
}

app.listen(port, () => {
    logger.info(`Server listening at http://localhost:${port}`);
});

//on_cancel
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const redis = require('redis');
const winston = require('winston');


app.use(bodyParser.json());

/*const client = redis.createClient();
client.connect().catch(err => console.error('Redis connection error:', err));

client.on('error', (err) => {
    console.error('Redis error:', err);
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()],
});*/

async function saveOrder(order) {
    await client.set(order.id, JSON.stringify(order));
}

async function getOrder(orderId) {
    const order = await client.get(orderId);
    return order ? JSON.parse(order) : null;
}

app.post('/on_cancel', async (req, res) => {
    const onCancelResponse = req.body;
    logger.info(`Received /on_cancel: ${JSON.stringify(onCancelResponse)}`);

    if (await validateOnCancel(onCancelResponse)) {
        await processOnCancel(onCancelResponse.message.order);
        res.json({ context: onCancelResponse.context, message: { ack: { status: 'ACK' } } });
        logger.info(`Sent ACK for /on_cancel`);
    } else {
        res.status(400).json({
            context: onCancelResponse.context,
            error: { type: 'DOMAIN-ERROR', code: '22502', message: 'Invalid /on_cancel request' },
        });
        logger.error('Sent NACK for /on_cancel');
    }
});

async function validateOnCancel(onCancelResponse) {
    if (!onCancelResponse || !onCancelResponse.context || !onCancelResponse.message || !onCancelResponse.message.order) {
        return false;
    }

    const order = onCancelResponse.message.order;
    if (!order.id || order.state !== 'Cancelled' || !order.fulfillments) {
        return false;
    }

    const existingOrder = await getOrder(order.id);
    if (!existingOrder) {
        logger.error(`Order ID ${order.id} not found in stored orders`);
        return false;
    }

    if (existingOrder.state === 'Cancelled') {
        logger.error(`Order ${order.id} is already cancelled.`);
        return false;
    }

    if (!validateQuote(existingOrder, order)) {
        logger.error(`Quote validation failed for order ${order.id}`);
        return false; 
    }

    return true;
}

function validateQuote(originalOrder, cancelledOrder) {
    if (!cancelledOrder.quote || !originalOrder.quote) {
        return false;
    }

    return (
        cancelledOrder.quote.price.value === originalOrder.quote.price.value &&
        cancelledOrder.quote.price.currency === originalOrder.quote.price.currency
    );
}

async function processOnCancel(order) {
    logger.info(`Processing /on_cancel for order: ${order.id}`);

    order.state = 'Cancelled';
    await saveOrder(order);

    logger.info(`Order ${order.id} cancelled successfully.`);
}

app.listen(port, () => {
    logger.info(`Server listening at http://localhost:${port}`);
});


//ONDC ENDPOINTS
app.get("/generate-keys", async (req, res) => {
  const keys = await createKeyPair();
  res.json(keys);
});

app.post("/sign", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  if (!privateKey)
    return res.status(500).json({ error: "Private key not configured" });

  console.log("Message to be Signed:", message);
  const header = await createAuthorizationHeader(message, privateKey);
  res.json({ authorization: header });
});

app.post("/verify", async (req, res) => {
  const { signedString, message } = req.body;
  if (!signedString || !message)
    return res.status(400).json({ error: "Invalid request" });

  console.log("Signed String for Verification:", signedString);
  console.log("Message for Verification:", message);

  const { signingString } = await createSigningString(message);
  const isValid = await verifyMessage(signedString, signingString, publicKey);

  res.json({ valid: isValid });
});

//The /lookup endpoint to call the ONDC registry
app.post("/lookup", async (req, res) => {
  const { subscriber_id, domain, ukId, country, city, type } = req.body;

  console.log("first");
  console.log("subscriber_id", subscriber_id);
  console.log("domain", domain);
  console.log("ukId", ukId);
  console.log("country", country);
  console.log("city", city);
  console.log("type", type);

  // Ensuring all required fields are provided
  if (!subscriber_id || !domain || !ukId || !country || !city || !type) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Calling ONDC registry using Axios
    const response = await axios.post(
      "https://staging.registry.ondc.org/lookup",
      {
        subscriber_id,
        domain,
        ukId,
        country,
        city,
        type,
      }
    );

    // Forwarding the response from the ONDC registry to the client
    res.json(response.data);
  } catch (error) {
    console.error("Error calling ONDC registry:", error.message);
    res.status(500).json({ error: "Error calling ONDC registry" });
  }
});

// The /vlookup endpoint to call the ONDC registry
app.post("/vlookup", async (req, res) => {
  const {
    sender_subscriber_id,
    request_id,
    timestamp,
    signature,
    search_parameters,
    country,
    domain,
  } = req.body;

  // Validate required fields
  if (
    !sender_subscriber_id ||
    !request_id ||
    !timestamp ||
    !signature ||
    !search_parameters ||
    !country ||
    !domain
  ) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Prepare data for the ONDC registry lookup request
    const payload = {
      sender_subscriber_id,
      request_id,
      timestamp,
      signature,
      search_parameters,
      country,
      domain,
    };

    // Call the ONDC registry vlookup endpoint using Axios
    const response = await axios.post(
      "https://staging.registry.ondc.org/vlookup",
      payload
    );

    // Forward the response from the ONDC registry to the client
    res.json(response.data);
  } catch (error) {
    console.error("Error calling ONDC registry:", error.message);
    res.status(500).json({ error: "Error calling ONDC registry" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

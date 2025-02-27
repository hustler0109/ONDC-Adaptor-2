import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Avatar,
  Chip,
  Button,
} from "@material-tailwind/react";
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import authorsTableData from "../../data/authors-table-data.js";

export function Tables() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("http://localhost/opencartsite/index.php?route=api/allproducts&json", {
      method: "GET",
      credentials: "include",
    })   
      .then((response) => response.json())
      .then((data) => {
        if (data.shop_products) {
          setProducts(
            data.shop_products.map((item) => ({
              product_id: item.product_id,
              image: item.image.replace("localhost", "localhost/opencartsite"),
              name: item.name,
              model: item.model,
              price: parseFloat(item.price).toFixed(2),
              quantity: parseInt(item.quantity, 10),
              status: item.quantity > 0 ? "In Stock" : "Out of Stock",
            }))
          );
        }
      })
      .catch(() => {
        console.error("Error fetching products. Using fallback data.");
        setProducts(
          authorsTableData.map((item, index) => ({
            product_id: index + 1,
            image: item.img,
            name: item.name,
            model: item.category,
            price: item.price.replace("$", ""),
            quantity: item.sales,
            status: item.stock,
          }))
        );
      });
  }, []);

  const handleEdit = (id) => {
    alert(`Edit product ${id}`);
  };

  const handleDelete = (id) => {
    setProducts(products.filter((product) => product.product_id !== id));
  };

  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-8 p-6">
          <Typography variant="h6" color="white">
            Product Listing
          </Typography>
        </CardHeader>
        <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
          <table className="w-full min-w-[640px] table-auto">
            <thead>
              <tr>
                {["Product ID", "Image", "Name", "Model", "Price", "Quantity", "Status", "Actions"].map(
                  (el) => (
                    <th key={el} className="border-b border-blue-gray-50 py-3 px-5 text-left">
                      <Typography variant="small" className="text-[11px] font-bold uppercase text-blue-gray-400">
                        {el}
                      </Typography>
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {products.map(({ product_id, image, name, model, price, quantity, status }, key) => {
                const className = `py-3 px-5 ${key === products.length - 1 ? "" : "border-b border-blue-gray-50"}`;
                return (
                  <tr key={product_id}>
                    <td className={className}>{product_id}</td>
                    <td className={className}><Avatar src={image} alt={name} size="sm" /></td>
                    <td className={className}>{name}</td>
                    <td className={className}>{model}</td>
                    <td className={className}>${price}</td>
                    <td className={className}>{quantity}</td>
                    <td className={className}>
                      <Chip
                        variant="gradient"
                        color={status === "In Stock" ? "green" : "red"}
                        value={status}
                        className="py-0.5 px-2 text-[11px] font-medium w-fit"
                      />
                    </td>
                    <td className={className}>
                      <div className="flex gap-3">
                        <Button variant="text" color="blue" onClick={() => handleEdit(product_id)}>
                          <PencilIcon className="h-5 w-5" />
                        </Button>
                        <Button variant="text" color="red" onClick={() => handleDelete(product_id)}>
                          <TrashIcon className="h-5 w-5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

export default Tables;
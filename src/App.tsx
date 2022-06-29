import "./App.css";
import { UploadIcon } from "@heroicons/react/solid";
import * as XLSX from "xlsx";
import { useRef, useState } from "react";
import donateCode from "./code.json";
import TextInput from "./components/TextInput";
import Dropdown from "./components/Dropdown";

function App() {
  const inputRef = useRef(null);

  const [會員編號, set會員編號] = useState("");
  const [商店代號, set商店代號] = useState("");
  const [判斷條件, set判斷條件] = useState(2);
  const [等於, set等於] = useState("已繳費");
  const [訂單編號, set訂單編號] = useState(0);
  const [B2C買受人名稱, setB2C買受人名稱] = useState(0);
  const [B2B統一編號, setB2B統一編號] = useState(0);
  const [B2B公司名稱, setB2B公司名稱] = useState(0);
  const [電子郵件, set電子郵件] = useState(0);
  const [手機條碼載具, set手機條碼載具] = useState(0);
  const [捐贈碼, set捐贈碼] = useState(0);
  const [發票金額, set發票金額] = useState(0);
  const [商品名稱, set商品名稱] = useState("教育訓練課程");
  const [單位, set單位] = useState("次");

  const [sheetData, setSheetData] = useState<Array<Array<any>>>([[]]);

  console.log(donateCode);

  const handleXlsxFile = async (e: React.FormEvent<HTMLInputElement>) => {
    const fileInput = e.target as HTMLInputElement;
    if (fileInput.files) {
      const file = fileInput.files[0];

      if (file.type === "text/csv") {
        /* data is an Text */
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onloadend = function (e: any) {
          const content = e.target.result;
          const workbook = XLSX.read(content, { type: "string" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const s: Array<Array<any>> = XLSX.utils.sheet_to_json(firstSheet, {
            header: 1,
            defval: "",
            blankrows: true,
          });
          setSheetData(s);
        };
      } else if (file.name.match(".(xlsx|xls)$")) {
        /* data is an ArrayBuffer */
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const s: Array<Array<any>> = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          defval: "",
          blankrows: true,
        });
        setSheetData(s);
      }
    }
    fileInput.value = "";
  };

  const handleTransation = () => {
    const data = [];
    data.push([
      "H",
      "INVO",
      會員編號,
      商店代號,
      new Date().getFullYear().toString() +
        (new Date().getMonth() + 1).toString().padStart(2, "0") +
        new Date().getDate().toString().padStart(2, "0"),
    ]);

    const customers = sheetData
      .filter((v) => v[判斷條件] === 等於 && v[發票金額] > 0)
      .slice(0)
      .map((d) => {
        console.log(d);

        let r1 = ["S"];
        r1.push(d[訂單編號]);
        if (d[B2B統一編號] && d[B2B公司名稱]) {
          r1.push("B2B");
          r1.push(d[B2B統一編號].toString().padStart(8, "0"));
          r1.push(d[B2B公司名稱]);
          r1.push(d[電子郵件]);
          r1.push("");
          r1.push("");
          r1.push("");
          r1.push("");
          r1.push("Y");
        } else {
          r1.push("B2C");
          r1.push("");
          r1.push(d[B2C買受人名稱]);
          r1.push(d[電子郵件]);
          r1.push("");
          if (
            !d[捐贈碼] &&
            !donateCode.find((v) => v.捐贈碼 === d[捐贈碼].toString())
          ) {
            r1.push(d[手機條碼載具] ? "0" : "2");
            r1.push(
              d[手機條碼載具] ? d[手機條碼載具].toUpperCase() : d[電子郵件]
            );
            r1.push("");
            r1.push("N");
          } else {
            r1.push("");
            r1.push("");
            r1.push(d[捐贈碼]);
            r1.push("N");
          }
        }
        r1.push("1");
        r1.push("5");
        r1.push(Math.round(parseInt(d[發票金額]) / 1.05).toString());
        r1.push(
          Math.round(d[發票金額] - parseInt(d[發票金額]) / 1.05).toString()
        );
        r1.push(d[發票金額]);
        r1.push("");

        let r2 = [];

        r2.push("I");
        r2.push(d[訂單編號]);
        r2.push(商品名稱);
        r2.push(1);
        r2.push(單位);
        r2.push(d[發票金額]);
        r2.push(d[發票金額]);

        data.push(r1);
        data.push(r2);

        return [r1, r2];
      });

    const textfile = window.URL.createObjectURL(
      new File(
        [
          "\uFEFF",
          data
            .map((r) => {
              return r.join(",");
            })
            .join("\r\n"),
        ],
        `${商店代號}_${
          new Date().getFullYear().toString() +
          (new Date().getMonth() + 1).toString().padStart(2, "0") +
          new Date().getDate().toString().padStart(2, "0")
        }.txt`
      )
    );

    const tempLink = document.createElement("a");
    tempLink.href = textfile;
    tempLink.setAttribute(
      "download",
      `${商店代號}_${
        new Date().getFullYear().toString() +
        (new Date().getMonth() + 1).toString().padStart(2, "0") +
        new Date().getDate().toString().padStart(2, "0")
      }.txt`
    );
    tempLink.click();
  };

  return (
    <div className="App">
      <div className="bg-gradient-to-r from-sky-400 to-indigo-500 w-full min-h-screen flex flex-row justify-center items-center">
        <div>
          <span className="pr-2 font-bold">選擇開發票資料</span>
          <label
            htmlFor="upload"
            className="cursor-pointer inline-flex w-15 justify-center rounded-md bg-black bg-opacity-20 px-4 py-2 text-sm font-medium text-white hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
          >
            <UploadIcon className="w-5"></UploadIcon>
          </label>
          <input
            type="file"
            id="upload"
            className="hidden"
            ref={inputRef}
            accept=".csv,.xls,.xlsx"
            onChange={handleXlsxFile}
          />

          {sheetData.length > 0 && sheetData[0].length > 0 && (
            <div>
              <table>
                <tbody>
                  <tr>
                    <th>ezPay會員編號</th>
                    <td>
                      <TextInput
                        value={會員編號}
                        onChange={set會員編號}
                      ></TextInput>
                    </td>
                  </tr>
                  <tr>
                    <th>商店代號</th>
                    <td>
                      <TextInput
                        value={商店代號}
                        onChange={set商店代號}
                      ></TextInput>
                    </td>
                  </tr>
                  <tr>
                    <th>判斷條件</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={判斷條件}
                        onChange={set判斷條件}
                      ></Dropdown>
                      等於
                      <TextInput value={等於} onChange={set等於}></TextInput>
                    </td>
                  </tr>
                  <tr>
                    <th>訂單編號</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={訂單編號}
                        onChange={set訂單編號}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>B2C買受人名稱</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={B2C買受人名稱}
                        onChange={setB2C買受人名稱}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>B2B統一編號</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={B2B統一編號}
                        onChange={setB2B統一編號}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>B2B公司名稱</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={B2B公司名稱}
                        onChange={setB2B公司名稱}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>Email</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={電子郵件}
                        onChange={set電子郵件}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>手機條碼載具</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={手機條碼載具}
                        onChange={set手機條碼載具}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>捐贈碼</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={捐贈碼}
                        onChange={set捐贈碼}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>發票金額</th>
                    <td>
                      <Dropdown
                        options={sheetData[0]}
                        value={發票金額}
                        onChange={set發票金額}
                      ></Dropdown>
                    </td>
                  </tr>
                  <tr>
                    <th>商品名稱</th>
                    <td>
                      <TextInput
                        value={商品名稱}
                        onChange={set商品名稱}
                      ></TextInput>
                    </td>
                  </tr>
                  <tr>
                    <th>單位</th>
                    <td>
                      <TextInput value={單位} onChange={set單位}></TextInput>
                    </td>
                  </tr>
                </tbody>
              </table>

              <label
                onClick={handleTransation}
                className="cursor-pointer inline-flex w-15 justify-center rounded-md bg-black bg-opacity-20 px-4 py-2 text-sm font-medium text-white hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
              >
                下載
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

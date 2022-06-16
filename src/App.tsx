import "./App.css";
import { UploadIcon } from "@heroicons/react/solid";
import { parse } from "csv-parse/browser/esm";
import { useRef } from "react";

function App() {
  const inputRef = useRef(null);
  return (
    <div className="App">
      <div className="flex items-center justify-center">
        <span>選擇開發票資料</span>
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
          accept=".csv"
          onChange={(e) => {
            console.log(e.target.files);
            const INPUT_FILE = e.target.files && e.target.files[0];
            if (!INPUT_FILE) {
              return;
            }
            let fileReader = new FileReader();
            fileReader.readAsText(INPUT_FILE);
            fileReader.onload = function () {
              parse(fileReader.result as string, (err, data) => {
                const [header, ...csv_data] = data;
                console.log(header, csv_data);
              });
            };
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export default App;

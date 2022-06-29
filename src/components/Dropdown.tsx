import { Fragment, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, SelectorIcon } from "@heroicons/react/solid";

export default function Dropdown({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: Function;
  options: Array<string>;
}) {
  const dropdownOptions = options.map((v, i) => {
    return {
      name: v,
      id: i,
    };
  });

  const [selectedOption, setSelectedOption] = useState(dropdownOptions[value]);
  console.log(selectedOption);

  return (
    <Listbox
      value={selectedOption}
      onChange={(v) => {
        setSelectedOption(v);
        onChange(v.id);
      }}
    >
      <div className="relative mt-1">
        <Listbox.Button className="relative w-full cursor-default rounded-lg text-black bg-white py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
          <span className="block truncate">{selectedOption.name}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <SelectorIcon
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {dropdownOptions.map((option, index) => (
              <Listbox.Option
                key={index}
                className={({ active }) =>
                  `relative cursor-default select-none p-2 text-gray-900`
                }
                value={option}
              >
                <span className={`block truncate font-normal`}>
                  {option.name}
                </span>
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}

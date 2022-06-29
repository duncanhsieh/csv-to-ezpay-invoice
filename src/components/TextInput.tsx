export default function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: Function;
}) {
  return (
    <input
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      type="text"
      className="relative w-full cursor-default rounded-lg bg-white text-black py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm"
    ></input>
  );
}

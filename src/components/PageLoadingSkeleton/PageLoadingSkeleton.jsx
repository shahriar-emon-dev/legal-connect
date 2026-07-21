import React from 'react';

const PageLoadingSkeleton = () => {
  return (
    <div className="w-full min-h-[70vh] p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header Shimmer */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="space-y-3 w-full md:w-1/3">
          <div className="h-8 bg-gray-200 rounded-xl w-3/4 animate-pulse"></div>
          <div className="h-4 bg-gray-100 rounded-lg w-full animate-pulse"></div>
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-28 bg-gray-200 rounded-xl animate-pulse"></div>
          <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse"></div>
        </div>
      </div>

      {/* Grid Stats / Overview Shimmer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-gray-100 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 rounded-xl bg-gray-100 animate-pulse"></div>
            </div>
            <div className="h-7 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse"></div>
          </div>
        ))}
      </div>

      {/* Table / Content List Shimmer */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="h-6 w-40 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-9 w-60 bg-gray-100 rounded-xl animate-pulse"></div>
        </div>

        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="flex items-center justify-between p-4 rounded-xl bg-gray-50/70 border border-gray-100">
              <div className="flex items-center gap-4 w-1/2">
                <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse shrink-0"></div>
                <div className="space-y-2 w-full">
                  <div className="h-4 w-3/5 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-2/5 bg-gray-100 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse hidden sm:block"></div>
              <div className="h-8 w-24 bg-gray-200 rounded-xl animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PageLoadingSkeleton;

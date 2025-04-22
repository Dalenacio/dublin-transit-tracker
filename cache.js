let cache = {
    data: null,
    lastUpdated: null,
    apiCallsToday: 0
  };

export const getCache = () => cache;
export const updateCache = (newData) => {
  const now = new Date();
  if (cache.lastUpdated && cache.lastUpdated.toDateString() != now.toDateString()){cache.apiCallsToday = 0}
  
  cache = {
    data: newData,
    lastUpdated: new Date(),
    apiCallsToday: cache.apiCallsToday + 1
  };
};